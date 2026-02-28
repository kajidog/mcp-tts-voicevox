import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AccentPhrase, AudioQuery, AudioSegment } from '../types'
import { resynthesizeSegmentOnServer } from './playerToolClient'

export interface EditDraftPayload {
  text: string
  speaker: number
  speedScale: number
  intonationScale: number
  volumeScale: number
  prePhonemeLength: number
  postPhonemeLength: number
  pauseLengthScale: number
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
}

interface UseSegmentResynthesisArgs {
  app: App
  viewUUID?: string
  localSegments: AudioSegment[]
  currentIndex: number
  setLocalSegments: Dispatch<SetStateAction<AudioSegment[]>>
  setResynthesizingSet: Dispatch<SetStateAction<Set<number>>>
  setIsApplying: Dispatch<SetStateAction<boolean>>
  onSuccess: () => void
}

export function useSegmentResynthesis({
  app,
  viewUUID,
  localSegments,
  currentIndex,
  setLocalSegments,
  setResynthesizingSet,
  setIsApplying,
  onSuccess,
}: UseSegmentResynthesisArgs) {
  return useCallback(
    async (draft: EditDraftPayload, applyToSameSpeaker: boolean, bulkSwitchSpeaker: boolean) => {
      const segment = localSegments[currentIndex]
      if (!segment) return
      const draftQuery = draft.audioQuery
        ? {
            ...draft.audioQuery,
            accent_phrases: draft.accentPhrases ?? draft.audioQuery.accent_phrases,
            speedScale: draft.speedScale,
            intonationScale: draft.intonationScale,
            volumeScale: draft.volumeScale,
            prePhonemeLength: draft.prePhonemeLength,
            postPhonemeLength: draft.postPhonemeLength,
            pauseLengthScale: draft.pauseLengthScale,
          }
        : undefined

      const speakerChanged = draft.speaker !== segment.speaker
      const needsSameSpeaker = applyToSameSpeaker || (bulkSwitchSpeaker && speakerChanged)
      const sameSpeakerIndices = needsSameSpeaker
        ? localSegments
            .map((s, i) => (s.speaker === segment.speaker && i !== currentIndex ? i : -1))
            .filter((i) => i >= 0)
        : []
      const allIndices = [currentIndex, ...sameSpeakerIndices]
      const nextSegmentsSnapshot = localSegments.map((seg, i) => {
        if (i === currentIndex) {
          return {
            ...seg,
            text: draft.text,
            speaker: draft.speaker,
            speedScale: draft.speedScale,
            intonationScale: draft.intonationScale,
            volumeScale: draft.volumeScale,
            prePhonemeLength: draft.prePhonemeLength,
            postPhonemeLength: draft.postPhonemeLength,
            pauseLengthScale: draft.pauseLengthScale,
            audioQuery: draftQuery,
            accentPhrases: draft.accentPhrases ?? draftQuery?.accent_phrases,
          }
        }
        if (!sameSpeakerIndices.includes(i)) return seg
        return {
          ...seg,
          speaker: bulkSwitchSpeaker && speakerChanged ? draft.speaker : seg.speaker,
          speedScale: applyToSameSpeaker ? draft.speedScale : seg.speedScale,
          intonationScale: applyToSameSpeaker ? draft.intonationScale : seg.intonationScale,
          volumeScale: applyToSameSpeaker ? draft.volumeScale : seg.volumeScale,
          prePhonemeLength: applyToSameSpeaker ? draft.prePhonemeLength : seg.prePhonemeLength,
          postPhonemeLength: applyToSameSpeaker ? draft.postPhonemeLength : seg.postPhonemeLength,
          pauseLengthScale: applyToSameSpeaker ? draft.pauseLengthScale : seg.pauseLengthScale,
        }
      })

      setIsApplying(true)
      setResynthesizingSet((prev) => {
        const next = new Set(prev)
        for (const i of allIndices) next.add(i)
        return next
      })

      try {
        const currentNewData = await resynthesizeSegmentOnServer(app, {
          viewUUID,
          segmentIndex: currentIndex,
          text: draft.text,
          speaker: draft.speaker,
          speedScale: draft.speedScale,
          intonationScale: draft.intonationScale,
          volumeScale: draft.volumeScale,
          prePhonemeLength: draft.prePhonemeLength,
          postPhonemeLength: draft.postPhonemeLength,
          pauseLengthScale: draft.pauseLengthScale,
          audioQuery: draftQuery,
          accentPhrases: draft.accentPhrases ?? draftQuery?.accent_phrases,
          persistState: true,
          segments: nextSegmentsSnapshot.map((seg) => ({
            text: seg.text,
            speaker: seg.speaker,
            audioQuery: seg.audioQuery,
            speedScale: seg.speedScale,
            intonationScale: seg.intonationScale,
            volumeScale: seg.volumeScale,
            prePhonemeLength: seg.prePhonemeLength,
            postPhonemeLength: seg.postPhonemeLength,
            pauseLengthScale: seg.pauseLengthScale,
            accentPhrases: seg.audioQuery?.accent_phrases ?? seg.accentPhrases,
          })),
        })

        const sameSpeakerResults = await Promise.all(
          sameSpeakerIndices.map(async (i) => {
            const seg = localSegments[i]
            try {
              const result = await resynthesizeSegmentOnServer(app, {
                viewUUID,
                segmentIndex: i,
                text: seg.text,
                speaker: bulkSwitchSpeaker && speakerChanged ? draft.speaker : seg.speaker,
                speedScale: applyToSameSpeaker ? draft.speedScale : (seg.speedScale ?? 1.0),
                intonationScale: applyToSameSpeaker ? draft.intonationScale : (seg.intonationScale ?? 1.0),
                volumeScale: applyToSameSpeaker ? draft.volumeScale : (seg.volumeScale ?? 1.0),
                prePhonemeLength: applyToSameSpeaker ? draft.prePhonemeLength : (seg.prePhonemeLength ?? 0.1),
                postPhonemeLength: applyToSameSpeaker ? draft.postPhonemeLength : (seg.postPhonemeLength ?? 0.1),
                pauseLengthScale: applyToSameSpeaker ? draft.pauseLengthScale : (seg.pauseLengthScale ?? 1.0),
                // 話者変更時は旧話者のaccentPhrasesを渡さない（ピッチ値が旧話者用で棒読みになるため）
                // generateQuery() で新話者用のアクセント句を生成させる
                accentPhrases: (bulkSwitchSpeaker && speakerChanged) ? undefined : (seg.audioQuery?.accent_phrases ?? seg.accentPhrases),
                persistState: false,
              })
              if (result) return { index: i, data: result }
            } catch (e) {
              console.error(`Failed to resynthesize segment ${i}:`, e)
            }
            return null
          })
        )

        setLocalSegments((prev) =>
          prev.map((value, i) => {
            if (i === currentIndex && currentNewData) {
              return {
                ...value,
                audioBase64: currentNewData.audioBase64,
                text: currentNewData.text ?? draft.text,
                speaker: currentNewData.speaker ?? draft.speaker,
                speakerName: currentNewData.speakerName ?? value.speakerName,
                kana: currentNewData.kana ?? value.kana,
                audioQuery: currentNewData.audioQuery ?? draftQuery ?? value.audioQuery,
                accentPhrases:
                  currentNewData.accentPhrases ??
                  currentNewData.audioQuery?.accent_phrases ??
                  draft.accentPhrases ??
                  draftQuery?.accent_phrases ??
                  value.accentPhrases,
                speedScale: currentNewData.speedScale ?? draft.speedScale,
                intonationScale: currentNewData.intonationScale ?? draft.intonationScale,
                volumeScale: currentNewData.volumeScale ?? draft.volumeScale,
                prePhonemeLength: currentNewData.prePhonemeLength ?? draft.prePhonemeLength,
                postPhonemeLength: currentNewData.postPhonemeLength ?? draft.postPhonemeLength,
                pauseLengthScale: currentNewData.pauseLengthScale ?? draft.pauseLengthScale,
              }
            }

            const ssResult = sameSpeakerResults.find((r) => r?.index === i)
            if (ssResult?.data) {
              const d = ssResult.data
              return {
                ...value,
                audioBase64: d.audioBase64,
                speaker: bulkSwitchSpeaker && speakerChanged ? (d.speaker ?? draft.speaker) : value.speaker,
                speakerName: bulkSwitchSpeaker && speakerChanged ? (d.speakerName ?? value.speakerName) : value.speakerName,
                kana: d.kana ?? value.kana,
                audioQuery: d.audioQuery ?? value.audioQuery,
                accentPhrases: d.accentPhrases ?? value.accentPhrases,
                speedScale: applyToSameSpeaker ? (d.speedScale ?? draft.speedScale) : value.speedScale,
                intonationScale: applyToSameSpeaker ? (d.intonationScale ?? draft.intonationScale) : value.intonationScale,
                volumeScale: applyToSameSpeaker ? (d.volumeScale ?? draft.volumeScale) : value.volumeScale,
                prePhonemeLength: applyToSameSpeaker ? (d.prePhonemeLength ?? draft.prePhonemeLength) : value.prePhonemeLength,
                postPhonemeLength: applyToSameSpeaker ? (d.postPhonemeLength ?? draft.postPhonemeLength) : value.postPhonemeLength,
                pauseLengthScale: applyToSameSpeaker ? (d.pauseLengthScale ?? draft.pauseLengthScale) : value.pauseLengthScale,
              }
            }

            return value
          })
        )

        onSuccess()
      } catch (e) {
        console.error('Failed to resynthesize segment:', e)
      } finally {
        setIsApplying(false)
        setResynthesizingSet((prev) => {
          const next = new Set(prev)
          for (const i of allIndices) next.delete(i)
          return next
        })
      }
    },
    [app, viewUUID, localSegments, currentIndex, onSuccess, setLocalSegments, setResynthesizingSet, setIsApplying]
  )
}
