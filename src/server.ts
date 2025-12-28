import { type AudioQuery, VoicevoxClient } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'

// サーバー初期化
export const server = new McpServer({
  name: 'MCP TTS Voicevox',
  version: '0.2.3',
  description: 'A Voicevox server that converts text to speech for playback and saving.',
})

// Voicevoxクライアント初期化
const voicevoxClient = new VoicevoxClient({
  url: process.env.VOICEVOX_URL ?? 'http://localhost:50021',
  defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER || '1'),
  defaultSpeedScale: Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE || '1.0'),
})

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

// ツール登録
server.registerTool(
  'speak',
  {
    title: 'Speak',
    description: 'Convert text to speech and play it',
    inputSchema: {
      text: z
        .string()
        .describe(
          'Text string with line breaks and optional speaker prefix "1:Hello\\n2:World". For faster playback start, make the first element short.'
        ),
      query: z.string().optional().describe('Voice synthesis query'),
      speaker: z.number().optional().describe('Default speaker ID (optional)'),
      speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
      immediate: z.boolean().optional().describe('Start playback immediately (optional, default: true)'),
      waitForStart: z.boolean().optional().describe('Wait for playback to start (optional, default: false)'),
      waitForEnd: z.boolean().optional().describe('Wait for playback to end (optional, default: false)'),
    },
  },
  async ({ text, speaker, query, speedScale, immediate, waitForStart, waitForEnd }): Promise<CallToolResult> => {
    try {
      // 環境変数からデフォルトの再生オプションを取得
      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const defaultWaitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START === 'true'
      const defaultWaitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true'

      const playbackOptions = {
        immediate: immediate ?? defaultImmediate,
        waitForStart: waitForStart ?? defaultWaitForStart,
        waitForEnd: waitForEnd ?? defaultWaitForEnd,
      }

      if (query) {
        const audioQuery = parseAudioQuery(query, speedScale)
        const result = await voicevoxClient.enqueueAudioGeneration(audioQuery, {
          speaker,
          speedScale,
          ...playbackOptions,
        })
        return createSuccessResponse(result)
      }

      const result = await processTextInput(text, speaker, speedScale, playbackOptions)
      return createSuccessResponse(result)
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

server.registerTool(
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
  async ({ text, speaker, speedScale }): Promise<CallToolResult> => {
    try {
      const query = await voicevoxClient.generateQuery(text, speaker, speedScale)
      return createSuccessResponse(JSON.stringify(query))
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

server.registerTool(
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
  async ({ text, query, speaker, output, speedScale }): Promise<CallToolResult> => {
    try {
      if (query) {
        const audioQuery = parseAudioQuery(query, speedScale)
        const filePath = await voicevoxClient.generateAudioFile(audioQuery, output, speaker)
        return createSuccessResponse(filePath)
      }

      if (text) {
        const filePath = await voicevoxClient.generateAudioFile(text, output, speaker, speedScale)
        return createSuccessResponse(filePath)
      }

      throw new Error('queryパラメータとtextパラメータのどちらかを指定してください')
    } catch (error) {
      return createErrorResponse(error)
    }
  }
)

server.registerTool(
  'stop_speaker',
  {
    title: 'Stop Speaker',
    description: 'Stop the current speaker',
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

server.registerTool(
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

server.registerTool(
  'get_speaker_detail',
  {
    title: 'Get Speaker Detail',
    description: 'Get detail of a speaker by id',
    inputSchema: {
      uuid: z.string().describe('Speaker UUID (speaker uuid)'),
    },
  },
  async ({ uuid }): Promise<CallToolResult> => {
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
