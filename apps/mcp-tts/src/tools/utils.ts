import { getSessionConfig } from '@kajidog/mcp-core'
import { type VoicevoxClient, formatSpeakResponse, parseAudioQuery, parseStringInput } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

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
 * 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
 */
export const getEffectiveSpeaker = (explicitSpeaker?: number, sessionId?: string): number | undefined => {
  if (explicitSpeaker !== undefined) return explicitSpeaker
  const sessionConfig = getSessionConfig(sessionId)
  return sessionConfig?.defaultSpeaker
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
