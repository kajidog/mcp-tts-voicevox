import type { AccentPhrase, AudioQuery } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerAppToolIfEnabled } from '../registration.js'
import type { ToolHandlerExtra } from '../types.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'
import { accentPhraseSchema, audioQuerySchema } from './schemas.js'

export function registerPlayerStateTools(context: PlayerUIToolContext): void {
  const { deps, shared, saveStateForViewAndSession, resolveSpeakerNameMap } = context
  const { server, disabledTools, config } = deps
  const { playerResourceUri } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_save_player_state_for_player',
    {
      title: 'Save Player State (Player)',
      description:
        'Persist current player segments to server state without synthesizing audio. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().optional().describe('Player instance ID to associate this state with'),
        segments: z
          .array(
            z.object({
              text: z.string(),
              speaker: z.number(),
              speedScale: z.number().optional(),
              intonationScale: z.number().optional(),
              volumeScale: z.number().optional(),
              prePhonemeLength: z.number().optional(),
              postPhonemeLength: z.number().optional(),
              pauseLengthScale: z.number().optional(),
              audioQuery: audioQuerySchema.optional(),
              accentPhrases: z.array(accentPhraseSchema).optional(),
            })
          )
          .describe('Full current player segment list to persist'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (
      {
        viewUUID,
        segments,
      }: {
        viewUUID?: string
        segments: Array<{
          text: string
          speaker: number
          speedScale?: number
          intonationScale?: number
          volumeScale?: number
          prePhonemeLength?: number
          postPhonemeLength?: number
          pauseLengthScale?: number
          audioQuery?: AudioQuery
          accentPhrases?: AccentPhrase[]
        }>
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        if (!segments || segments.length === 0) {
          throw new Error('segments is required')
        }

        const stateKey = viewUUID ?? extra?.sessionId ?? 'global'
        const effectiveDefaultSpeaker = config.defaultSpeaker
        const effectiveSpeed = config.defaultSpeedScale
        const speakerNameMap = await resolveSpeakerNameMap(segments, effectiveDefaultSpeaker)

        const nextState = {
          segments: segments.map((seg) => {
            const speakerId = seg.speaker ?? effectiveDefaultSpeaker
            return {
              text: seg.text,
              speaker: speakerId,
              speakerName: speakerNameMap.get(speakerId) ?? `Speaker ${speakerId}`,
              kana: seg.audioQuery?.kana,
              speedScale: seg.speedScale ?? effectiveSpeed,
              intonationScale: seg.intonationScale,
              volumeScale: seg.volumeScale,
              prePhonemeLength: seg.prePhonemeLength,
              postPhonemeLength: seg.postPhonemeLength,
              pauseLengthScale: seg.pauseLengthScale,
              audioQuery: seg.audioQuery,
              accentPhrases: seg.audioQuery?.accent_phrases ?? seg.accentPhrases,
            }
          }),
          updatedAt: Date.now(),
        }
        saveStateForViewAndSession(stateKey, extra?.sessionId, nextState)

        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, viewUUID: stateKey, count: segments.length }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
