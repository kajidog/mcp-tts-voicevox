import type { AccentPhrase, AudioQuery } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerAppToolIfEnabled } from '../registration.js'
import type { ToolHandlerExtra } from '../types.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'
import { accentPhraseSchema, audioQuerySchema } from './schemas.js'

export function registerPlayerSynthesisTools(context: PlayerUIToolContext): void {
  const { deps, shared, saveStateForViewAndSession, resolveSpeakerNameMap } = context
  const { server, disabledTools, config } = deps
  const { playerResourceUri, synthesizeWithCache, getSessionState } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_resynthesize_for_player',
    {
      title: 'Resynthesize (Player)',
      description: 'Re-synthesize audio with a different speaker or updated parameters. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().optional().describe('Player instance ID to associate this synthesis with'),
        text: z.string().describe('Text to re-synthesize'),
        speaker: z.number().optional().describe('Speaker ID (uses server default if omitted)'),
        audioQuery: audioQuerySchema
          .optional()
          .describe('Audio query to synthesize from (preferred over text parameters)'),
        speedScale: z.number().optional().describe('Playback speed (uses server default if omitted)'),
        intonationScale: z.number().optional().describe('Intonation scale 抑揚 (optional)'),
        volumeScale: z.number().optional().describe('Volume scale 音量 (optional)'),
        prePhonemeLength: z.number().optional().describe('Pre-phoneme silence length in seconds (optional)'),
        postPhonemeLength: z.number().optional().describe('Post-phoneme silence length in seconds (optional)'),
        pauseLengthScale: z.number().optional().describe('Pause length scale between phrases 間の長さ (optional)'),
        accentPhrases: z.array(accentPhraseSchema).optional().describe('Accent phrases override'),
        autoPlay: z.boolean().optional().describe('Auto-play audio when loaded (uses server config if omitted)'),
        segmentIndex: z.number().int().min(0).optional().describe('Segment index for single-segment state update'),
        persistState: z.boolean().optional().describe('Persist player state to server store (default: true)'),
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
          .optional()
          .describe('All current player segments — pass the full list to update server state'),
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
        text,
        speaker,
        audioQuery,
        speedScale,
        intonationScale,
        volumeScale,
        prePhonemeLength,
        postPhonemeLength,
        pauseLengthScale,
        accentPhrases,
        autoPlay,
        segmentIndex,
        persistState,
        segments,
      }: {
        viewUUID?: string
        text: string
        speaker?: number
        audioQuery?: AudioQuery
        speedScale?: number
        intonationScale?: number
        volumeScale?: number
        prePhonemeLength?: number
        postPhonemeLength?: number
        pauseLengthScale?: number
        accentPhrases?: AccentPhrase[]
        autoPlay?: boolean
        segmentIndex?: number
        persistState?: boolean
        segments?: Array<{
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
        const effectiveSpeed = speedScale ?? config.defaultSpeedScale
        const effectiveAutoPlay = autoPlay ?? config.autoPlay
        const shouldPersistState = persistState !== false
        const effectiveDefaultSpeaker = speaker ?? config.defaultSpeaker
        const stateKey = viewUUID ?? extra?.sessionId ?? 'global'

        if (segments && segments.length > 0 && shouldPersistState) {
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
        }

        const result = await synthesizeWithCache({
          text,
          speaker: effectiveDefaultSpeaker,
          audioQuery,
          speedScale: effectiveSpeed,
          intonationScale,
          volumeScale,
          prePhonemeLength,
          postPhonemeLength,
          pauseLengthScale,
          accentPhrases,
        })

        if (shouldPersistState && segmentIndex !== undefined) {
          const prev = getSessionState(stateKey) ?? (extra?.sessionId ? getSessionState(extra.sessionId) : undefined)
          if (prev?.segments[segmentIndex]) {
            const nextSegments = prev.segments.slice()
            nextSegments[segmentIndex] = {
              ...nextSegments[segmentIndex],
              text: result.text,
              speaker: result.speaker,
              speakerName: result.speakerName,
              kana: result.kana,
              audioQuery: result.audioQuery,
              accentPhrases: result.accentPhrases,
              speedScale: result.speedScale,
              intonationScale: result.intonationScale,
              volumeScale: result.volumeScale,
              prePhonemeLength: result.prePhonemeLength,
              postPhonemeLength: result.postPhonemeLength,
              pauseLengthScale: result.pauseLengthScale,
            }
            saveStateForViewAndSession(stateKey, extra?.sessionId, {
              segments: nextSegments,
              updatedAt: Date.now(),
            })
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                audioBase64: result.audioBase64,
                text: result.text,
                speaker: result.speaker,
                speakerName: result.speakerName,
                kana: result.kana,
                audioQuery: result.audioQuery,
                accentPhrases: result.accentPhrases,
                speedScale: result.speedScale,
                intonationScale: result.intonationScale,
                volumeScale: result.volumeScale,
                prePhonemeLength: result.prePhonemeLength,
                postPhonemeLength: result.postPhonemeLength,
                pauseLengthScale: result.pauseLengthScale,
                autoPlay: effectiveAutoPlay,
                viewUUID,
              }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
