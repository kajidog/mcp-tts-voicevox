import { type AudioQuery, type SpeakResult, VoicevoxClient } from '@kajidog/voicevox-client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { getConfig } from './config'
import { getSessionConfig } from './session'

// ツールハンドラーのextraパラメータ用の型定義
interface ToolHandlerExtra {
  sessionId?: string
}

// 設定を取得
const config = getConfig()

// サーバー初期化
export const server = new McpServer({
  name: 'MCP TTS Voicevox',
  version: '0.3.1',
  description: 'A Voicevox server that converts text to speech for playback and saving.',
})

// Voicevoxクライアント初期化
const voicevoxClient = new VoicevoxClient({
  url: config.voicevoxUrl,
  defaultSpeaker: config.defaultSpeaker,
  defaultSpeedScale: config.defaultSpeedScale,
  useStreaming: config.useStreaming,
})

// 無効化ツールのセット
const disabledTools = new Set(config.disabledTools)

// 制限設定
const restrictions = {
  immediate: config.restrictImmediate,
  waitForStart: config.restrictWaitForStart,
  waitForEnd: config.restrictWaitForEnd,
}

// ユーティリティ関数
const createErrorResponse = (error: unknown): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
})

const createSuccessResponse = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
})

const formatSpeakResponse = (result: SpeakResult): string => {
  if (result.status === 'error') {
    return `Error: ${result.errorMessage}`
  }

  const statusLabel = result.status === 'played' ? 'Played' : 'Queued'
  const moreSegments = result.segmentCount > 1 ? ` +${result.segmentCount - 1} more` : ''

  return `${statusLabel} (${result.mode}): "${result.textPreview}"${moreSegments}`
}

const parseAudioQuery = (query: string, speedScale?: number): AudioQuery => {
  const audioQuery = JSON.parse(query) as AudioQuery
  if (speedScale !== undefined) {
    audioQuery.speedScale = speedScale
  }
  return audioQuery
}

const parseStringInput = (input: string): Array<{ text: string; speaker?: number }> => {
  // \n と \\n の両方に対応するため、まず \\n を \n に変換してから分割
  const normalizedInput = input.replace(/\\n/g, '\n')
  const lines = normalizedInput.split('\n').filter((line) => line.trim())
  return lines.map((line) => {
    const match = line.match(/^(\d+):(.*)$/)
    if (match) {
      return { text: match[2].trim(), speaker: Number.parseInt(match[1], 10) }
    }
    return { text: line }
  })
}

/**
 * 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
 */
const getEffectiveSpeaker = (explicitSpeaker?: number, sessionId?: string): number | undefined => {
  if (explicitSpeaker !== undefined) return explicitSpeaker
  const sessionConfig = getSessionConfig(sessionId)
  return sessionConfig?.defaultSpeaker
}

const processTextInput = async (
  text: string,
  speaker?: number,
  speedScale?: number,
  playbackOptions?: {
    immediate?: boolean
    waitForStart?: boolean
    waitForEnd?: boolean
  }
) => {
  const segments = parseStringInput(text)
  return await voicevoxClient.speak(segments, {
    speaker,
    speedScale,
    ...playbackOptions,
  })
}

/**
 * 条件付きツール登録（無効化されたツールは登録しない）
 */
function registerToolIfEnabled(name: string, definition: any, handler: any) {
  if (disabledTools.has(name)) {
    console.error(`Tool "${name}" is disabled via configuration`)
    return
  }
  server.registerTool(name, definition, handler)
}

/**
 * speak ツールの動的スキーマを構築
 */
function buildSpeakInputSchema() {
  const schema: Record<string, z.ZodType> = {
    text: z
      .string()
      .describe(
        'Text split by line breaks (\\n). IMPORTANT: Each line = one speech unit (processed and played separately). Keep the FIRST LINE SHORT for quick playback start - audio begins as soon as the first line is synthesized. Example: "Hi!\\nThis is a longer explanation that follows." Optional speaker prefix per line: "1:Hello\\n2:World"'
      ),
    query: z.string().optional().describe('Voice synthesis query'),
    speaker: z.number().optional().describe('Default speaker ID (optional)'),
    speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
  }

  // 制限されていない場合のみスキーマに追加
  if (!restrictions.immediate) {
    schema.immediate = z
      .boolean()
      .optional()
      .describe(
        'If true, stops current playback and plays new audio immediately. If false, waits for current playback to finish. Default depends on environment variable.'
      )
  }

  if (!restrictions.waitForStart) {
    schema.waitForStart = z.boolean().optional().describe('Wait for playback to start (optional, default: false)')
  }

  if (!restrictions.waitForEnd) {
    schema.waitForEnd = z.boolean().optional().describe('Wait for playback to end (optional, default: false)')
  }

  return schema
}

// ツール登録

// ping_voicevox ツール
registerToolIfEnabled(
  'ping_voicevox',
  {
    title: 'Ping VOICEVOX',
    description: 'Check if VOICEVOX Engine is running and reachable',
  },
  async (): Promise<CallToolResult> => {
    try {
      const health = await voicevoxClient.checkHealth()
      if (health.connected) {
        return createSuccessResponse(`VOICEVOX is running at ${health.url} (v${health.version})`)
      }
      return createErrorResponse(
        new Error(`VOICEVOX is not reachable at ${health.url}. Please ensure VOICEVOX Engine is running.`)
      )
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

// speak ツール
registerToolIfEnabled(
  'speak',
  {
    title: 'Speak',
    description:
      'Convert text to speech and play it. Text is split by line breaks (\\n) into separate speech units. Each line is processed as an independent audio segment.',
    inputSchema: buildSpeakInputSchema(),
  },
  async (
    {
      text,
      speaker,
      query,
      speedScale,
      immediate,
      waitForStart,
      waitForEnd,
    }: {
      text: string
      speaker?: number
      query?: string
      speedScale?: number
      immediate?: boolean
      waitForStart?: boolean
      waitForEnd?: boolean
    },
    extra: ToolHandlerExtra
  ): Promise<CallToolResult> => {
    try {
      // 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
      const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId)

      // 設定からデフォルトの再生オプションを取得
      const playbackOptions = {
        immediate: immediate ?? config.defaultImmediate,
        waitForStart: waitForStart ?? config.defaultWaitForStart,
        waitForEnd: waitForEnd ?? config.defaultWaitForEnd,
      }

      let result: SpeakResult
      if (query) {
        const audioQuery = parseAudioQuery(query, speedScale)
        result = await voicevoxClient.enqueueAudioGeneration(audioQuery, {
          speaker: effectiveSpeaker,
          speedScale,
          ...playbackOptions,
        })
      } else {
        result = await processTextInput(text, effectiveSpeaker, speedScale, playbackOptions)
      }

      return createSuccessResponse(formatSpeakResponse(result))
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

registerToolIfEnabled(
  'generate_query',
  {
    title: 'Generate Query',
    description: 'Generate a query for voice synthesis',
    inputSchema: {
      text: z.string().describe('Text for voice synthesis'),
      speaker: z.number().optional().describe('Default speaker ID (optional)'),
      speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
    },
  },
  async (
    {
      text,
      speaker,
      speedScale,
    }: {
      text: string
      speaker?: number
      speedScale?: number
    },
    extra: ToolHandlerExtra
  ): Promise<CallToolResult> => {
    try {
      // 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
      const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId)
      const query = await voicevoxClient.generateQuery(text, effectiveSpeaker, speedScale)
      return createSuccessResponse(JSON.stringify(query))
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

registerToolIfEnabled(
  'synthesize_file',
  {
    title: 'Synthesize File',
    description: 'Generate an audio file and return its absolute path',
    inputSchema: {
      text: z
        .string()
        .optional()
        .describe('Text for voice synthesis (if both query and text provided, query takes precedence)'),
      query: z.string().optional().describe('Voice synthesis query'),
      output: z.string().describe('Output path for the audio file'),
      speaker: z.number().optional().describe('Default speaker ID (optional)'),
      speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
    },
  },
  async (
    {
      text,
      query,
      speaker,
      output,
      speedScale,
    }: {
      text?: string
      query?: string
      speaker?: number
      output: string
      speedScale?: number
    },
    extra: ToolHandlerExtra
  ): Promise<CallToolResult> => {
    try {
      // 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
      const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId)

      if (query) {
        const audioQuery = parseAudioQuery(query, speedScale)
        const filePath = await voicevoxClient.generateAudioFile(audioQuery, output, effectiveSpeaker)
        return createSuccessResponse(filePath)
      }

      if (text) {
        const filePath = await voicevoxClient.generateAudioFile(text, output, effectiveSpeaker, speedScale)
        return createSuccessResponse(filePath)
      }

      throw new Error('queryパラメータとtextパラメータのどちらかを指定してください')
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

registerToolIfEnabled(
  'stop_speaker',
  {
    title: 'Stop Speaker',
    description: 'Stop current audio playback',
    inputSchema: {
      random_string: z.string().describe('Dummy parameter for no-parameter tools'),
    },
  },
  async (): Promise<CallToolResult> => {
    try {
      await voicevoxClient.clearQueue()
      return createSuccessResponse('スピーカーを停止しました')
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

registerToolIfEnabled(
  'get_speakers',
  {
    title: 'Get Speakers',
    description: 'Get a list of available speakers',
  },
  async (): Promise<CallToolResult> => {
    try {
      const speakers = await voicevoxClient.getSpeakers()
      const result = speakers.flatMap((speaker: any) =>
        speaker.styles.map((style: any) => ({
          uuid: speaker.speaker_uuid,
          speaker: style.id,
          name: `${speaker.name}:${style.name}`,
        }))
      )
      return createSuccessResponse(JSON.stringify(result))
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

registerToolIfEnabled(
  'get_speaker_detail',
  {
    title: 'Get Speaker Detail',
    description: 'Get detail of a speaker by id',
    inputSchema: {
      uuid: z.string().describe('Speaker UUID (speaker uuid)'),
    },
  },
  async ({ uuid }: { uuid: string }): Promise<CallToolResult> => {
    try {
      const allSpeakers = await voicevoxClient.getSpeakers()
      const targetSpeaker = allSpeakers.find((speaker: any) => speaker.speaker_uuid === uuid)

      if (!targetSpeaker) {
        throw new Error(`指定されたUUID ${uuid} のスピーカーが見つかりませんでした`)
      }

      const styles = targetSpeaker.styles.map((style: any) => ({
        id: style.id,
        name: style.name,
        type: style.type || 'normal',
      }))

      const simplifiedInfo = {
        uuid: targetSpeaker.speaker_uuid,
        name: targetSpeaker.name,
        version: targetSpeaker.version,
        supported_features: targetSpeaker.supported_features,
        styles: styles,
      }

      return createSuccessResponse(JSON.stringify(simplifiedInfo))
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

// 設定エクスポート（テスト用）
export { config }
