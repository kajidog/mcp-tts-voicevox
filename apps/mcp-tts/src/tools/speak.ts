import type { SpeakResult } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps, ToolHandlerExtra } from './types.js'
import {
  createErrorResponse,
  createSuccessResponse,
  formatSpeakResponse,
  getEffectiveSpeaker,
  parseAudioQuery,
  processTextInput,
} from './utils.js'

/**
 * speak ツールの動的スキーマを構築
 */
export function buildSpeakInputSchema(restrictions: {
  immediate: boolean
  waitForStart: boolean
  waitForEnd: boolean
}) {
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

export function registerSpeakTool(deps: ToolDeps) {
  const { server, voicevoxClient, config, disabledTools, restrictions } = deps

  registerToolIfEnabled(
    server,
    disabledTools,
    'speak',
    {
      title: 'Speak',
      description:
        'Convert text to speech and play it. Text is split by line breaks (\\n) into separate speech units. Each line is processed as an independent audio segment.',
      inputSchema: buildSpeakInputSchema(restrictions),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
          result = await processTextInput(voicevoxClient, text, effectiveSpeaker, speedScale, playbackOptions)
        }

        return createSuccessResponse(formatSpeakResponse(result))
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
