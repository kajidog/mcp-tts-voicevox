import { formatSpeakResponse, parseAudioQuery, parseStringInput, type VoicevoxClient } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ToolHandlerExtra } from './types.js'

// Re-export functions moved to voicevox-client (keeps existing './utils.js' imports working)
export { formatSpeakResponse, parseAudioQuery, parseStringInput }

export const createErrorResponse = (error: unknown): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true,
})

export const createSuccessResponse = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
})

/**
 * 有効な話者IDを取得（優先順位: 明示的パラメータ > リクエストヘッダー X-Voicevox-Speaker > グローバル設定）
 *
 * ステートレス運用のため、プロジェクト別デフォルト話者は毎リクエストの
 * `X-Voicevox-Speaker` ヘッダーから直接読み取る（セッションへの事前保存は行わない）。
 */
export const getEffectiveSpeaker = (explicitSpeaker?: number, extra?: ToolHandlerExtra): number | undefined => {
  if (explicitSpeaker !== undefined) return explicitSpeaker

  const raw = extra?.requestInfo?.headers?.['x-voicevox-speaker']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value !== undefined) {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed
  }
  return undefined
}

export const processTextInput = async (
  voicevoxClient: VoicevoxClient,
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
