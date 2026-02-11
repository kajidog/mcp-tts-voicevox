import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps } from './types.js'
import { createErrorResponse, createSuccessResponse } from './utils.js'

export function registerSpeakerTools(deps: ToolDeps) {
  const { server, voicevoxClient, disabledTools } = deps

  // ping_voicevox ツール
  registerToolIfEnabled(
    server,
    disabledTools,
    'ping_voicevox',
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

  // get_speaker_detail ツール
  registerToolIfEnabled(
    server,
    disabledTools,
    'get_speaker_detail',
    {
      title: 'Get Speaker Detail',
      description: 'Get detail of a speaker by id',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        uuid: z.string().describe('Speaker UUID (speaker uuid)'),
      },
    },
    async ({ uuid }: { uuid: string }): Promise<CallToolResult> => {
      try {
        const allSpeakers = await voicevoxClient.getSpeakers()
        const targetSpeaker = allSpeakers.find((speaker) => speaker.speaker_uuid === uuid)

        if (!targetSpeaker) {
          throw new Error(`指定されたUUID ${uuid} のスピーカーが見つかりませんでした`)
        }

        const styles = targetSpeaker.styles.map((style) => ({
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
}
