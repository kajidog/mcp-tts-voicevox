import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerAppToolIfEnabled } from '../registration.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'

export function registerPlayerSpeakerTools(context: PlayerUIToolContext): void {
  const { deps, shared, speakerIconCache } = context
  const { server, disabledTools } = deps
  const { playerVoicevoxApi, playerResourceUri, getSpeakerList } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_speakers_for_player',
    {
      title: 'Get Speakers (Player)',
      description: 'Get speaker list for the player UI. This tool is only callable from the app UI.',
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const list = await getSpeakerList()
        return { content: [{ type: 'text', text: JSON.stringify(list) }] }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_speaker_icon_for_player',
    {
      title: 'Get Speaker Icon (Player)',
      description: 'Get speaker portrait icon by UUID. Only callable from the app UI.',
      inputSchema: {
        speakerUuid: z.string().describe('Speaker UUID'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({ speakerUuid }: { speakerUuid: string }): Promise<CallToolResult> => {
      try {
        const cached = speakerIconCache.get(speakerUuid)
        if (cached) {
          return { content: [{ type: 'text', text: JSON.stringify({ portrait: cached }) }] }
        }

        const info = await playerVoicevoxApi.getSpeakerInfo(speakerUuid)
        const portrait = info.portrait
        if (portrait) {
          speakerIconCache.set(speakerUuid, portrait)
          return { content: [{ type: 'text', text: JSON.stringify({ portrait }) }] }
        }

        return { content: [{ type: 'text', text: JSON.stringify({ portrait: null }) }] }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
