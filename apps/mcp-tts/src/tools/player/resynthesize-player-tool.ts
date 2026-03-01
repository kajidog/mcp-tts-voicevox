import { randomUUID } from 'node:crypto'
import { type AccentPhrase, type AudioQuery, applyNotationAccents, parseNotation } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerAppToolIfEnabled } from '../registration.js'
import type { ToolDeps, ToolHandlerExtra } from '../types.js'
import { createErrorResponse, getEffectiveSpeaker } from '../utils.js'
import { playerResourceUri } from './runtime.js'
import type { PlayerRuntime } from './runtime.js'
import { getSessionState, setSessionState } from './session-state.js'
import type { PlayerSegmentState } from './session-state.js'

export function registerResynthesizePlayerTool(deps: ToolDeps, runtime: PlayerRuntime): void {
  const { server, config, disabledTools } = deps

  registerAppToolIfEnabled(
    server,
    disabledTools,
    'resynthesize_player',
    {
      title: 'Resynthesize Player',
      description: 'Update a single player track. Returns new viewUUID. See get_player_state for notation details.',
      inputSchema: {
        viewUUID: z.string().describe('Latest viewUUID'),
        trackIndex: z.number().int().min(0).describe('Segment index to update'),
        phrases: z.string().optional().describe('Inline notation (see get_player_state hint)'),
        speaker: z.number().optional().describe('Speaker ID'),
        speedScale: z.number().optional().describe('Speed'),
        intonationScale: z.number().optional().describe('Intonation'),
        volumeScale: z.number().optional().describe('Volume'),
        prePhonemeLength: z.number().optional().describe('Pre-silence (sec)'),
        postPhonemeLength: z.number().optional().describe('Post-silence (sec)'),
        pauseLengthScale: z.number().optional().describe('Pause length'),
        autoPlay: z.boolean().optional().describe('Auto-play'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: playerResourceUri } },
    },
    async (
      {
        viewUUID: inputViewUUID,
        trackIndex,
        phrases,
        speaker,
        speedScale,
        intonationScale,
        volumeScale,
        prePhonemeLength,
        postPhonemeLength,
        pauseLengthScale,
        autoPlay,
      }: {
        viewUUID: string
        trackIndex: number
        phrases?: string
        speaker?: number
        speedScale?: number
        intonationScale?: number
        volumeScale?: number
        prePhonemeLength?: number
        postPhonemeLength?: number
        pauseLengthScale?: number
        autoPlay?: boolean
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const state = getSessionState(inputViewUUID, extra?.sessionId)
        if (!state) {
          throw new Error('No player state found for the given viewUUID. Use speak_player first.')
        }
        if (trackIndex < 0 || trackIndex >= state.segments.length) {
          throw new Error(`trackIndex ${trackIndex} is out of range. Valid range: 0-${state.segments.length - 1}`)
        }

        const existingSegment = state.segments[trackIndex]
        const effectiveDefaultSpeaker = getEffectiveSpeaker(undefined, extra.sessionId) ?? config.defaultSpeaker
        const effectiveAutoPlay = autoPlay ?? config.autoPlay

        // 優先順位: 明示入力 > 既存セグメント > サーバーデフォルト
        const effectiveSpeaker = speaker ?? existingSegment.speaker ?? effectiveDefaultSpeaker
        const effectiveSpeed = speedScale ?? existingSegment.speedScale ?? config.defaultSpeedScale
        const effectiveIntonation = intonationScale ?? existingSegment.intonationScale
        const effectiveVolume = volumeScale ?? existingSegment.volumeScale
        const effectivePrePhoneme = prePhonemeLength ?? existingSegment.prePhonemeLength
        const effectivePostPhoneme = postPhonemeLength ?? existingSegment.postPhonemeLength
        const effectivePauseLength = pauseLengthScale ?? existingSegment.pauseLengthScale

        let updatedAccentPhrases: AccentPhrase[] | undefined
        let textChanged = false
        let effectiveText = existingSegment.text

        if (phrases !== undefined) {
          const parsedPhrases = parseNotation(phrases)
          const newCleanText = parsedPhrases.map((p) => p.cleanText).join('')

          const existingAccentPhrases =
            existingSegment.accentPhrases ?? (existingSegment.audioQuery?.accent_phrases as AccentPhrase[] | undefined)
          const existingCleanText = existingAccentPhrases
            ? existingAccentPhrases.flatMap((ap) => ap.moras.map((m) => m.text)).join('')
            : existingSegment.text

          if (newCleanText !== existingCleanText) {
            // テキスト変更時は query を作り直し、notation のアクセントを適用する。
            textChanged = true
            effectiveText = newCleanText
            const newQuery = await runtime.playerVoicevoxApi.generateQuery(newCleanText, effectiveSpeaker)
            updatedAccentPhrases = applyNotationAccents(parsedPhrases, newQuery.accent_phrases as AccentPhrase[])
          } else {
            // テキスト据え置き時は既存/デフォルト AccentPhrase に対してアクセントだけ更新する。
            const defaultQuery = await runtime.playerVoicevoxApi.generateQuery(effectiveText, effectiveSpeaker)
            const defaultAccentPhrases = defaultQuery.accent_phrases as AccentPhrase[]
            const baseAccentPhrases =
              existingAccentPhrases && existingAccentPhrases.length > 0 ? existingAccentPhrases : defaultAccentPhrases
            updatedAccentPhrases = applyNotationAccents(parsedPhrases, baseAccentPhrases, defaultAccentPhrases)
          }
        } else {
          updatedAccentPhrases =
            existingSegment.accentPhrases ?? (existingSegment.audioQuery?.accent_phrases as AccentPhrase[] | undefined)
        }

        let audioQueryForState: AudioQuery | undefined
        // テキスト未変更なら既存queryを再利用し、変更があれば query は再生成対象としてクリアする。
        if (!textChanged && existingSegment.audioQuery && updatedAccentPhrases) {
          audioQueryForState = {
            ...existingSegment.audioQuery,
            accent_phrases: updatedAccentPhrases,
            speedScale: effectiveSpeed,
            ...(effectiveIntonation !== undefined && { intonationScale: effectiveIntonation }),
            ...(effectiveVolume !== undefined && { volumeScale: effectiveVolume }),
            ...(effectivePrePhoneme !== undefined && { prePhonemeLength: effectivePrePhoneme }),
            ...(effectivePostPhoneme !== undefined && { postPhonemeLength: effectivePostPhoneme }),
            ...(effectivePauseLength !== undefined && { pauseLengthScale: effectivePauseLength }),
          }
        }

        const viewUUID = randomUUID()
        const speakerName = await runtime.getSpeakerName(effectiveSpeaker)

        const updatedSegmentState: PlayerSegmentState = {
          text: effectiveText,
          speaker: effectiveSpeaker,
          speakerName,
          kana: textChanged ? undefined : existingSegment.kana,
          audioQuery: audioQueryForState ?? (textChanged ? undefined : existingSegment.audioQuery),
          accentPhrases: updatedAccentPhrases,
          speedScale: effectiveSpeed,
          intonationScale: effectiveIntonation,
          volumeScale: effectiveVolume,
          prePhonemeLength: effectivePrePhoneme,
          postPhonemeLength: effectivePostPhoneme,
          pauseLengthScale: effectivePauseLength,
        }

        const newSegments = state.segments.slice()
        newSegments[trackIndex] = updatedSegmentState

        const speakerNameMap = await runtime.resolveSpeakerNames(newSegments.map((s) => s.speaker))
        const enrichedSegments = newSegments.map((seg) => ({
          ...seg,
          speakerName: speakerNameMap.get(seg.speaker) ?? seg.speakerName,
        }))

        const nextState = {
          segments: enrichedSegments,
          updatedAt: Date.now(),
        }
        // 新しい viewUUID を払い出し、古いUI状態との衝突を避ける。
        setSessionState(viewUUID, nextState)
        if (extra.sessionId && extra.sessionId !== viewUUID) {
          setSessionState(extra.sessionId, nextState)
        }

        const uiSegments = enrichedSegments.map((seg) => ({
          text: seg.text,
          speaker: seg.speaker,
          speakerName: seg.speakerName,
          speedScale: seg.speedScale,
          intonationScale: seg.intonationScale,
          volumeScale: seg.volumeScale,
          prePhonemeLength: seg.prePhonemeLength,
          postPhonemeLength: seg.postPhonemeLength,
          pauseLengthScale: seg.pauseLengthScale,
          accentPhrases: seg.accentPhrases,
        }))

        return {
          content: [
            {
              type: 'text',
              text: `Voicevox Player updated track ${trackIndex}. viewUUID: ${viewUUID}`,
            },
          ],
          structuredContent: {
            viewUUID,
            autoPlay: effectiveAutoPlay,
            segments: uiSegments,
            resynthesizedTrackIndex: trackIndex,
          },
          _meta: {
            viewUUID,
            autoPlay: effectiveAutoPlay,
            segments: uiSegments,
            resynthesizedTrackIndex: trackIndex,
          },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
