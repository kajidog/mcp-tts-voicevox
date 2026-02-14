import { getSessionConfig } from '@kajidog/mcp-core'
import type { AudioQuery, SpeakResult, VoicevoxClient } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

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

export const formatSpeakResponse = (result: SpeakResult): string => {
  if (result.status === 'error') {
    return `Error: ${result.errorMessage}`
  }

  const statusLabel = result.status === 'played' ? 'Played' : 'Queued'
  const moreSegments = result.segmentCount > 1 ? ` +${result.segmentCount - 1} more` : ''

  return `${statusLabel} (${result.mode}): "${result.textPreview}"${moreSegments}`
}

export const parseAudioQuery = (query: string, speedScale?: number): AudioQuery => {
  const audioQuery = JSON.parse(query) as AudioQuery
  if (speedScale !== undefined) {
    audioQuery.speedScale = speedScale
  }
  return audioQuery
}

export const parseStringInput = (input: string): Array<{ text: string; speaker?: number }> => {
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
