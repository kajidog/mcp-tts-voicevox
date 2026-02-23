import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AudioSegment } from '../types'
import { resynthesizeSegmentOnServer } from './playerToolClient'

interface UseAddSegmentArgs {
  app: App
  viewUUID?: string
  localSegments: AudioSegment[]
  setLocalSegments: Dispatch<SetStateAction<AudioSegment[]>>
  setResynthesizingSet: Dispatch<SetStateAction<Set<number>>>
}

export function useAddSegment({
  app,
  viewUUID,
  localSegments,
  setLocalSegments,
  setResynthesizingSet,
}: UseAddSegmentArgs) {
  return useCallback(
    async (text: string, speaker: number) => {
      const newIndex = localSegments.length
      const placeholder: AudioSegment = {
        audioBase64: '',
        text,
        speaker,
        speakerName: `Speaker ${speaker}`,
      }
      const nextSegmentsSnapshot = [...localSegments, placeholder]

      setLocalSegments((prev) => [...prev, placeholder])
      setResynthesizingSet((prev) => new Set(prev).add(newIndex))

      try {
        const newData = await resynthesizeSegmentOnServer(app, {
          viewUUID,
          text,
          speaker,
          segmentIndex: newIndex,
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
        if (newData) {
          setLocalSegments((prev) =>
            prev.map((seg, i) =>
              i === newIndex
                ? {
                    ...seg,
                    audioBase64: newData.audioBase64,
                    speaker: newData.speaker ?? speaker,
                    speakerName: newData.speakerName ?? seg.speakerName,
                    audioQuery: newData.audioQuery,
                    accentPhrases: newData.accentPhrases ?? newData.audioQuery?.accent_phrases,
                    speedScale: newData.speedScale,
                    prePhonemeLength: newData.prePhonemeLength,
                    postPhonemeLength: newData.postPhonemeLength,
                  }
                : seg
            )
          )
        }
      } catch (e) {
        console.error('Failed to add segment:', e)
        setLocalSegments((prev) => prev.filter((_, i) => i !== newIndex))
      } finally {
        setResynthesizingSet((prev) => {
          const next = new Set(prev)
          next.delete(newIndex)
          return next
        })
      }
    },
    [app, viewUUID, localSegments, setLocalSegments, setResynthesizingSet]
  )
}
