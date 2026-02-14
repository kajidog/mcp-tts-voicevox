import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps } from './types.js'
import { createErrorResponse, createSuccessResponse } from './utils.js'

export function registerSpeakerTools(deps: ToolDeps) {
  const { server, voicevoxClient, disabledTools } = deps

  // ping_voicevox ツール
  registerToolIfEnabled(
    server,
    disabledTools,
    'ping',
    {
      title: 'Ping VOICEVOX',
      description: 'Check if VOICEVOX Engine is running and reachable',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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

  // stop_speaker ツール
  registerToolIfEnabled(
    server,
    disabledTools,
    'stop_speaker',
    {
      title: 'Stop Speaker',
      description: 'Stop current audio playback',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        await voicevoxClient.clearQueue()
        return createSuccessResponse('Speaker stopped successfully')
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // get_speakers ツール
  registerToolIfEnabled(
    server,
    disabledTools,
    'get_speakers',
    {
      title: 'Get Speakers',
      description: 'Get a list of available speakers',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
}
