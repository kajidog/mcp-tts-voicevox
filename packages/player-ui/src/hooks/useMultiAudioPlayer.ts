import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchExportCapability,
  fetchSpeakersAndPortraits,
  savePlayerStateOnServer,
  previewSegmentOnServer,
  resynthesizeSegmentOnServer,
  selectExportDirectory,
  type ExportCapability,
} from './playerToolClient'
import { saveLocalSnapshot } from './playerStateRecovery'
import { useAddSegment } from './useAddSegment'
import { useExportTracks } from './useExportTracks'
import { usePersistentBoolean } from './usePersistentBoolean'
import { useSegmentResynthesis, type EditDraftPayload } from './useSegmentResynthesis'
import type { AudioQuery, AudioSegment, MultiPlayerData, SpeakerInfo } from '../types'

interface UseMultiAudioPlayerArgs {
  app: App
  data: MultiPlayerData
  viewUUID?: string
}

type TransitionDirection = 'up' | 'down'

interface PreviousSegment {
  seg: AudioSegment
  direction: TransitionDirection
}

export type PanelMode = 'closed' | 'detail' | 'edit'

export interface EditDraft extends EditDraftPayload {
  originalText: string
}

function createEditDraft(segment: AudioSegment): EditDraft {
  const queryAccent = segment.audioQuery?.accent_phrases
  return {
    originalText: segment.text,
    text: segment.text,
    speaker: segment.speaker,
    speedScale: segment.speedScale ?? 1.0,
    intonationScale: segment.intonationScale ?? 1.0,
    volumeScale: segment.volumeScale ?? 1.0,
    prePhonemeLength: segment.prePhonemeLength ?? 0.1,
    postPhonemeLength: segment.postPhonemeLength ?? 0.1,
    pauseLengthScale: segment.pauseLengthScale ?? 1.0,
    audioQuery: segment.audioQuery,
    accentPhrases: queryAccent ?? segment.accentPhrases,
  }
}

function draftHasChanges(draft: EditDraft, segment: AudioSegment): boolean {
  if (draft.text !== segment.text) return true
  if (draft.speaker !== segment.speaker) return true
  if (Math.abs((draft.speedScale ?? 1.0) - (segment.speedScale ?? 1.0)) > 0.001) return true
  if (Math.abs((draft.intonationScale ?? 1.0) - (segment.intonationScale ?? 1.0)) > 0.001) return true
  if (Math.abs((draft.volumeScale ?? 1.0) - (segment.volumeScale ?? 1.0)) > 0.001) return true
  if (Math.abs((draft.prePhonemeLength ?? 0.1) - (segment.prePhonemeLength ?? 0.1)) > 0.001) return true
  if (Math.abs((draft.postPhonemeLength ?? 0.1) - (segment.postPhonemeLength ?? 0.1)) > 0.001) return true
  if (Math.abs((draft.pauseLengthScale ?? 1.0) - (segment.pauseLengthScale ?? 1.0)) > 0.001) return true
  if (JSON.stringify(draft.audioQuery ?? null) !== JSON.stringify(segment.audioQuery ?? null)) return true
  // アクセント句の比較（undefined は null として統一して比較）
  if (JSON.stringify(draft.accentPhrases ?? null) !== JSON.stringify(segment.accentPhrases ?? null)) return true
  return false
}

function buildAudioQueryForDraft(draft: EditDraft): AudioQuery | undefined {
  if (!draft.audioQuery) return undefined
  return {
    ...draft.audioQuery,
    accent_phrases: draft.accentPhrases ?? draft.audioQuery.accent_phrases,
    speedScale: draft.speedScale,
    intonationScale: draft.intonationScale,
    volumeScale: draft.volumeScale,
    prePhonemeLength: draft.prePhonemeLength,
    postPhonemeLength: draft.postPhonemeLength,
    pauseLengthScale: draft.pauseLengthScale,
  }
}

function mergeSegmentWithQuery(segment: AudioSegment): AudioSegment {
  const query = segment.audioQuery
  if (!query) return segment
  return {
    ...segment,
    kana: query.kana ?? segment.kana,
    accentPhrases: query.accent_phrases ?? segment.accentPhrases,
    speedScale: query.speedScale ?? segment.speedScale,
    intonationScale: query.intonationScale ?? segment.intonationScale,
    volumeScale: query.volumeScale ?? segment.volumeScale,
    prePhonemeLength: query.prePhonemeLength ?? segment.prePhonemeLength,
    postPhonemeLength: query.postPhonemeLength ?? segment.postPhonemeLength,
    pauseLengthScale: query.pauseLengthScale ?? segment.pauseLengthScale,
  }
}

export function useMultiAudioPlayer({ app, data, viewUUID }: UseMultiAudioPlayerArgs) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])
  const speakerButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const shouldAutoPlayRef = useRef(false)
  const shouldPlayPreviewRef = useRef(false)
  const prevIndexRef = useRef(0)
  const panelModeRef = useRef<PanelMode>('closed')
  // 自動取得中のセグメントインデックスを追跡（重複取得防止）
  const fetchingRef = useRef<Set<number>>(new Set())
  // audio未取得状態で autoPlay が要求された場合の保留フラグ（currentIndex の音声準備待ち）
  const autoPlayPendingRef = useRef(false)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [localSegments, setLocalSegments] = useState<AudioSegment[]>(data.segments)
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([])
  const [portraits, setPortraits] = useState<Record<string, string>>({})
  const [showSpeakerPanel, setShowSpeakerPanel] = usePersistentBoolean('voicevox-show-speaker-panel')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [showTrackList, setShowTrackList] = usePersistentBoolean('voicevox-show-track-list')
  const [resynthesizingSet, setResynthesizingSet] = useState<Set<number>>(new Set())
  // resynthesizingSet の最新値を ref で保持（auto-fetch effect の dep array を増やさないため）
  const resynthesizingSetRef = useRef(resynthesizingSet)
  const [exportCapability, setExportCapability] = useState<ExportCapability>({
    available: false,
    canChooseDirectory: false,
    canOpenDirectory: false,
  })
  const [isExporting, setIsExporting] = useState(false)
  const [prevSegment, setPrevSegment] = useState<PreviousSegment | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('closed')
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [applyToSameSpeaker, setApplyToSameSpeaker] = usePersistentBoolean('voicevox-apply-to-same-speaker')
  const [bulkSwitchSpeaker, setBulkSwitchSpeaker] = usePersistentBoolean('voicevox-bulk-switch-speaker')
  const [previewAudioBase64, setPreviewAudioBase64] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewPlayNonce, setPreviewPlayNonce] = useState(0)
  const [isApplying, setIsApplying] = useState(false)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const currentSegment = localSegments[currentIndex]
  const audioSrcBase64 =
    panelMode === 'edit' && previewIndex === currentIndex && previewAudioBase64
      ? previewAudioBase64
      : currentSegment?.audioBase64
  const audioSrc = audioSrcBase64 ? `data:audio/wav;base64,${audioSrcBase64}` : ''
  const isAutoAdvanceEnabled = autoAdvance && panelMode !== 'edit'

  // Keep ref in sync for use in audio event callbacks
  useEffect(() => {
    panelModeRef.current = panelMode
  }, [panelMode])

  useEffect(() => {
    resynthesizingSetRef.current = resynthesizingSet
  }, [resynthesizingSet])

  useEffect(() => {
    ; (async () => {
      try {
        const result = await fetchSpeakersAndPortraits(app)
        setSpeakers(result.speakers)
        setPortraits(result.portraits)
      } catch (e) {
        console.error('Failed to load speakers:', e)
      }
    })()
  }, [app])

  useEffect(() => {
    ; (async () => {
      try {
        const capability = await fetchExportCapability(app)
        setExportCapability(capability)
      } catch {
        setExportCapability({ available: false, canChooseDirectory: false, canOpenDirectory: false })
      }
    })()
  }, [app])

  useEffect(() => {
    saveLocalSnapshot(viewUUID, localSegments)
  }, [viewUUID, localSegments])

  const prevDataSegmentsStr = useRef<string>('')
  const initialAutoPlayPendingRef = useRef(false)

  useEffect(() => {
    const newStr = JSON.stringify(data.segments.map(s => ({ text: s.text, speaker: s.speaker })))
    const isNewScript = prevDataSegmentsStr.current !== newStr && prevDataSegmentsStr.current !== ''
    const isFirstLoad = prevDataSegmentsStr.current === ''

    prevDataSegmentsStr.current = newStr

    setLocalSegments(data.segments.map(mergeSegmentWithQuery))

    if (isNewScript || isFirstLoad) {
      fetchingRef.current = new Set()
      autoPlayPendingRef.current = false
      setCurrentIndex(0)
      setCurrentTime(0)
      prevIndexRef.current = 0
      setPrevSegment(null)

      if (data.autoPlay) {
        initialAutoPlayPendingRef.current = true
      }
    } else {
      setCurrentIndex(prev => prev >= data.segments.length ? Math.max(0, data.segments.length - 1) : prev)
    }
  }, [data.segments, data.autoPlay])

  // Process initial auto-play after all synthesis completes
  useEffect(() => {
    if (initialAutoPlayPendingRef.current && resynthesizingSetRef.current.size === 0) {
      const needsFetch = localSegments.some((seg, i) => !seg.audioBase64 && !fetchingRef.current.has(i))
      if (!needsFetch && localSegments.length > 0) {
        initialAutoPlayPendingRef.current = false
        setTimeout(() => {
          audioRef.current?.play().catch(console.error)
        }, 50)
      }
    }
  }, [resynthesizingSet, localSegments])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      // Auto-advance (even in edit mode, panel stays open)
      if (isAutoAdvanceEnabled && currentIndex < localSegments.length - 1) {
        const nextIndex = currentIndex + 1
        const nextSegment = localSegments[nextIndex]
        if (nextSegment?.audioBase64) {
          shouldAutoPlayRef.current = true
        } else {
          autoPlayPendingRef.current = true
        }
        setCurrentIndex((index) => index + 1)
        return
      }

      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [isAutoAdvanceEnabled, currentIndex, localSegments.length])

  useEffect(() => {
    if (currentIndex === prevIndexRef.current) return

    const direction: TransitionDirection = currentIndex > prevIndexRef.current ? 'up' : 'down'
    const oldSegment = localSegments[prevIndexRef.current]
    if (oldSegment) {
      setPrevSegment({ seg: oldSegment, direction })
    }
    prevIndexRef.current = currentIndex

    // When track changes, re-initialize edit draft if in edit mode
    const newSeg = localSegments[currentIndex]
    if (panelModeRef.current === 'edit' && newSeg) {
      setEditDraft(createEditDraft(newSeg))
    }
    setPreviewAudioBase64(null)
    setPreviewIndex(null)

    const timer = setTimeout(() => setPrevSegment(null), 300)
    return () => clearTimeout(timer)
  }, [currentIndex, localSegments])

  useEffect(() => {
    if (shouldAutoPlayRef.current) {
      shouldAutoPlayRef.current = false
      if (localSegments[currentIndex]?.audioBase64) {
        setTimeout(() => {
          audioRef.current?.play().catch(console.error)
        }, 50)
      } else {
        autoPlayPendingRef.current = true
      }
    }

    if (showTrackList) {
      setTimeout(() => {
        segmentRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 0)
    }
  }, [currentIndex, showTrackList, localSegments.length])

  useEffect(() => {
    if (!showSpeakerPanel || !currentSegment) return

    setTimeout(() => {
      const button = speakerButtonRefs.current[currentSegment.speaker]
      if (button) {
        button.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 0)
  }, [showSpeakerPanel, currentSegment?.speaker, speakers.length])

  // speak_player / resynthesize_player が音声なしでセグメントを返した場合、
  // _resynthesize_for_player で各セグメントの音声を自動取得する
  useEffect(() => {
    const missingIndices = localSegments
      .map((seg, i) =>
        !seg.audioBase64 && !fetchingRef.current.has(i) && !resynthesizingSetRef.current.has(i) ? i : -1
      )
      .filter((i) => i >= 0)

    if (missingIndices.length === 0) return

    setResynthesizingSet((prev) => {
      const next = new Set(prev)
      for (const i of missingIndices) {
        fetchingRef.current.add(i)
        next.add(i)
      }
      return next
    })

    for (const i of missingIndices) {
      const seg = localSegments[i]
      if (!seg) continue

      resynthesizeSegmentOnServer(app, {
        viewUUID,
        segmentIndex: i,
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
        persistState: true,
      })
        .then((result) => {
          if (result) {
            setLocalSegments((prev) =>
              prev.map((s, idx) =>
                idx === i
                  ? {
                    ...s,
                    audioBase64: result.audioBase64,
                    speakerName: result.speakerName ?? s.speakerName,
                    kana: result.kana ?? s.kana,
                    audioQuery: result.audioQuery ?? s.audioQuery,
                    speedScale: result.speedScale ?? s.speedScale,
                    intonationScale: result.intonationScale ?? s.intonationScale,
                    volumeScale: result.volumeScale ?? s.volumeScale,
                    accentPhrases: result.accentPhrases ?? result.audioQuery?.accent_phrases ?? s.accentPhrases,
                    prePhonemeLength: result.prePhonemeLength ?? s.prePhonemeLength,
                    postPhonemeLength: result.postPhonemeLength ?? s.postPhonemeLength,
                    pauseLengthScale: result.pauseLengthScale ?? s.pauseLengthScale,
                  }
                  : s
              )
            )
          }
        })
        .catch((e) => {
          console.error(`[useMultiAudioPlayer] Failed to fetch audio for segment ${i}:`, e)
        })
        .finally(() => {
          fetchingRef.current.delete(i)
          setResynthesizingSet((prev) => {
            const next = new Set(prev)
            next.delete(i)
            return next
          })
        })
    }
  }, [localSegments, app, viewUUID])

  // currentIndex の音声取得完了時に保留中 autoPlay を実行
  useEffect(() => {
    if (autoPlayPendingRef.current && localSegments[currentIndex]?.audioBase64) {
      autoPlayPendingRef.current = false
      setTimeout(() => {
        audioRef.current?.play().catch(console.error)
      }, 50)
    }
  }, [localSegments, currentIndex])

  // プレビュー音声がセットされた後（React 再レンダリング + audio src 更新済み）に再生する
  useEffect(() => {
    if (!shouldPlayPreviewRef.current || !previewAudioBase64) return
    shouldPlayPreviewRef.current = false
    const audio = audioRef.current
    if (!audio) return
    const tryPlay = () => {
      try {
        audio.currentTime = 0
      } catch {
        // ignore if seek is not possible yet
      }
      audio.play().catch(console.error)
    }
    if (audio.readyState >= 2) {
      tryPlay()
    } else {
      audio.addEventListener('canplay', tryPlay, { once: true })
    }
  }, [previewAudioBase64, previewPlayNonce])

  const getPortrait = useCallback(
    (speakerId: number) => {
      const info = speakers.find((speaker) => speaker.id === speakerId)
      return info?.uuid ? portraits[info.uuid] : null
    },
    [speakers, portraits]
  )

  const handleApplyToSameSpeakerChange = useCallback((checked: boolean) => {
    setApplyToSameSpeaker(checked)
  }, [setApplyToSameSpeaker])

  const handleBulkSwitchSpeakerChange = useCallback((checked: boolean) => {
    setBulkSwitchSpeaker(checked)
  }, [setBulkSwitchSpeaker])

  const changeEditDraft = useCallback(
    (updates: Partial<EditDraft>) => {
      setEditDraft((prev) => {
        if (!prev) return prev
        const next: EditDraft = { ...prev, ...updates }
        if (updates.speaker !== undefined && updates.speaker !== prev.speaker) {
          next.audioQuery = undefined
          next.accentPhrases = undefined
        }
        if (updates.text !== undefined) {
          if (updates.text !== prev.originalText) {
            next.audioQuery = undefined
            next.accentPhrases = undefined
          } else if (!next.audioQuery && currentSegment && currentSegment.text === updates.text) {
            next.audioQuery = currentSegment.audioQuery
            next.accentPhrases = currentSegment.audioQuery?.accent_phrases ?? currentSegment.accentPhrases
          }
        }
        return next
      })
    },
    [currentSegment]
  )

  const closePanel = useCallback(() => {
    setPanelMode('closed')
    setEditDraft(null)
  }, [])

  const openDetail = useCallback(() => {
    if (!localSegments[currentIndex]) return
    setPanelMode('detail')
    setEditDraft(null)
  }, [localSegments, currentIndex])

  const openEdit = useCallback(() => {
    const segment = localSegments[currentIndex]
    if (!segment) return
    setPanelMode('edit')
    setEditDraft(createEditDraft(segment))
    setShowTrackList(false)
  }, [localSegments, currentIndex, setShowTrackList])

  const resynthesizeSegment = useSegmentResynthesis({
    app,
    viewUUID,
    localSegments,
    currentIndex,
    setLocalSegments,
    setResynthesizingSet,
    setIsApplying,
    onSuccess: () => {
      setPanelMode('detail')
      setEditDraft(null)
      setPreviewAudioBase64(null)
      setPreviewIndex(null)
    },
  })

  const regenerateCurrentSegment = useCallback(async () => {
    const segment = localSegments[currentIndex]
    if (!segment) return

    setResynthesizingSet((prev) => {
      const next = new Set(prev)
      next.add(currentIndex)
      return next
    })

    try {
      const result = await resynthesizeSegmentOnServer(app, {
        viewUUID,
        segmentIndex: currentIndex,
        text: segment.text,
        speaker: segment.speaker,
        audioQuery: segment.audioQuery,
        speedScale: segment.speedScale,
        intonationScale: segment.intonationScale,
        volumeScale: segment.volumeScale,
        prePhonemeLength: segment.prePhonemeLength,
        postPhonemeLength: segment.postPhonemeLength,
        pauseLengthScale: segment.pauseLengthScale,
        accentPhrases: segment.audioQuery?.accent_phrases ?? segment.accentPhrases,
        persistState: true,
      })
      if (!result) return
      setLocalSegments((prev) =>
        prev.map((seg, idx) =>
          idx === currentIndex
            ? {
              ...seg,
              audioBase64: result.audioBase64,
              speaker: result.speaker ?? seg.speaker,
              speakerName: result.speakerName ?? seg.speakerName,
              kana: result.kana ?? seg.kana,
              audioQuery: result.audioQuery ?? seg.audioQuery,
              speedScale: result.speedScale ?? seg.speedScale,
              intonationScale: result.intonationScale ?? seg.intonationScale,
              volumeScale: result.volumeScale ?? seg.volumeScale,
              accentPhrases: result.accentPhrases ?? result.audioQuery?.accent_phrases ?? seg.accentPhrases,
              prePhonemeLength: result.prePhonemeLength ?? seg.prePhonemeLength,
              postPhonemeLength: result.postPhonemeLength ?? seg.postPhonemeLength,
              pauseLengthScale: result.pauseLengthScale ?? seg.pauseLengthScale,
            }
            : seg
        )
      )
    } catch (error) {
      console.error('Failed to regenerate current segment:', error)
    } finally {
      setResynthesizingSet((prev) => {
        const next = new Set(prev)
        next.delete(currentIndex)
        return next
      })
    }
  }, [app, currentIndex, localSegments, viewUUID])

  const selectSegment = useCallback(
    (index: number) => {
      setIsPlaying(false)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setCurrentIndex(index)
      setCurrentTime(0)
      // Panel stays open, draft is re-initialized in the currentIndex effect
    },
    []
  )

  const playSegment = useCallback(
    (index: number) => {
      setCurrentIndex(index)
      setCurrentTime(0)
      // Panel stays open
      setTimeout(() => {
        audioRef.current?.play().catch(console.error)
      }, 50)
    },
    []
  )

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      return
    }
    // 編集モード中、かつドラフトと現在セグメントに差分がある場合はプレビュー再生成
    if (panelMode === 'edit' && editDraft && currentSegment && draftHasChanges(editDraft, currentSegment)) {
      const isTextDirty = editDraft.text !== editDraft.originalText
      const draftQuery = buildAudioQueryForDraft(editDraft)
      setIsPreviewLoading(true)
      try {
        const result = await previewSegmentOnServer(app, {
          viewUUID,
          text: editDraft.text,
          speaker: editDraft.speaker,
          audioQuery: isTextDirty ? undefined : draftQuery,
          speedScale: editDraft.speedScale,
          intonationScale: editDraft.intonationScale,
          volumeScale: editDraft.volumeScale,
          prePhonemeLength: editDraft.prePhonemeLength,
          postPhonemeLength: editDraft.postPhonemeLength,
          pauseLengthScale: editDraft.pauseLengthScale,
          accentPhrases: isTextDirty ? undefined : editDraft.accentPhrases,
        })
        if (result?.audioBase64) {
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
          }
          setPreviewAudioBase64(result.audioBase64)
          setPreviewIndex(currentIndex)
          setPreviewPlayNonce((prev) => prev + 1)
          setEditDraft((prev) => {
            if (!prev) return prev
            const nextQuery = result.audioQuery ?? prev.audioQuery
            const nextAccent = result.accentPhrases ?? nextQuery?.accent_phrases ?? prev.accentPhrases
            return {
              ...prev,
              originalText: isTextDirty ? prev.text : prev.originalText,
              audioQuery: nextQuery,
              accentPhrases: nextAccent,
            }
          })
          // React 再レンダリング後に再生するため ref フラグを立て useEffect で処理する
          shouldPlayPreviewRef.current = true
          return
        }
      } catch (error) {
        console.error('Failed to preview draft segment:', error)
      } finally {
        setIsPreviewLoading(false)
      }
    }
    if (audio.duration > 0 && audio.currentTime >= Math.max(0, audio.duration - 0.02)) {
      audio.currentTime = 0
    }
    audio.play().catch(console.error)
  }, [isPlaying, panelMode, editDraft, currentSegment, app, viewUUID, currentIndex])

  const rewind = useCallback(() => {
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setCurrentIndex(0)
    setCurrentTime(0)
    // Panel stays open
  }, [])

  const goNext = useCallback(() => {
    if (currentIndex >= localSegments.length - 1) return
    // Panel stays open

    const wasPlaying = isPlaying
    setCurrentIndex(currentIndex + 1)
    setCurrentTime(0)
    if (wasPlaying) {
      shouldAutoPlayRef.current = true
    }
  }, [currentIndex, isPlaying, localSegments.length])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return
    // Panel stays open

    const wasPlaying = isPlaying
    setCurrentIndex(currentIndex - 1)
    setCurrentTime(0)
    if (wasPlaying) {
      shouldAutoPlayRef.current = true
    }
  }, [currentIndex, isPlaying])

  const groupedSpeakers = useMemo(
    () =>
      speakers.reduce(
        (groups, speaker) => {
          if (!groups[speaker.characterName]) groups[speaker.characterName] = []
          groups[speaker.characterName].push(speaker)
          return groups
        },
        {} as Record<string, SpeakerInfo[]>
      ),
    [speakers]
  )

  const persistSegments = useCallback(
    async (segments: AudioSegment[]) => {
      if (segments.length === 0) return
      try {
        await savePlayerStateOnServer(app, {
          viewUUID,
          segments: segments.map((seg) => ({
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
      } catch (e) {
        console.error('[useMultiAudioPlayer] Failed to persist player state:', e)
      }
    },
    [app, viewUUID]
  )

  const toggleSpeakerPanel = useCallback(() => {
    setShowSpeakerPanel((visible) => {
      if (!visible) {
        // Opening the panel -> set to detail mode
        const segment = localSegments[currentIndex]
        if (segment) {
          setPanelMode('detail')
          setEditDraft(null)
        }
      } else {
        // Closing -> also close edit mode
        setPanelMode('closed')
        setEditDraft(null)
      }
      return !visible
    })
  }, [localSegments, currentIndex])

  const cancelEdit = useCallback(() => {
    setPanelMode('detail')
    setEditDraft(null)
    setPreviewAudioBase64(null)
    setPreviewIndex(null)
  }, [])

  const deleteSegment = useCallback(
    (index: number) => {
      if (localSegments.length <= 1) return // Don't delete the last segment

      const nextSegments = localSegments.filter((_, i) => i !== index)
      setLocalSegments(nextSegments)
      void persistSegments(nextSegments)

      // Adjust currentIndex
      if (index < currentIndex) {
        setCurrentIndex((prev) => prev - 1)
      } else if (index === currentIndex) {
        // If deleting current, move to next (or prev if at end)
        const newIndex = index >= localSegments.length - 1 ? index - 1 : index
        setCurrentIndex(newIndex)
        setCurrentTime(0)
      }
    },
    [localSegments, currentIndex, persistSegments]
  )

  const reorderSegments = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return

      const nextSegments = [...localSegments]
      const [moved] = nextSegments.splice(fromIndex, 1)
      nextSegments.splice(toIndex, 0, moved)
      setLocalSegments(nextSegments)
      void persistSegments(nextSegments)

      // Adjust currentIndex to follow the currently playing segment
      setCurrentIndex((prev) => {
        if (prev === fromIndex) return toIndex
        if (fromIndex < prev && toIndex >= prev) return prev - 1
        if (fromIndex > prev && toIndex <= prev) return prev + 1
        return prev
      })
    },
    [localSegments, persistSegments]
  )

  const addSegment = useAddSegment({
    app,
    viewUUID,
    localSegments,
    setLocalSegments,
    setResynthesizingSet,
  })

  const exportTracks = useExportTracks({
    app,
    exportCapability,
    isExporting,
    localSegments,
    setIsExporting,
    setExportError,
  })

  const currentPortrait = currentSegment ? getPortrait(currentSegment.speaker) : null
  const isEditTextDirty = panelMode === 'edit' && !!editDraft && editDraft.text !== editDraft.originalText

  return {
    audioRef,
    segmentRefs,
    speakerButtonRefs,
    currentIndex,
    currentPortrait,
    currentSegment,
    currentTime,
    duration,
    isPlaying,
    localSegments,
    autoAdvance,
    isAutoAdvanceEnabled,
    groupedSpeakers,
    portraits,
    prevSegment,
    resynthesizingSet,
    exportCapability,
    isExporting,
    exportError,
    showSpeakerPanel,
    showTrackList,
    panelMode,
    editDraft,
    isEditTextDirty,
    applyToSameSpeaker,
    bulkSwitchSpeaker,
    isApplying,
    isPreviewLoading,
    goNext,
    goPrev,
    playSegment,
    rewind,
    selectSegment,
    setAutoAdvance,
    setShowSpeakerPanel,
    setShowTrackList,
    togglePlay,
    audioSrc,
    getPortrait,
    openDetail,
    openEdit,
    closePanel,
    toggleSpeakerPanel,
    cancelEdit,
    setEditDraft: changeEditDraft,
    resynthesizeSegment,
    regenerateCurrentSegment,
    deleteSegment,
    reorderSegments,
    addSegment,
    exportTracks,
    exportTracksWithDialog: useCallback(async () => {
      try {
        setExportError(null)
        if (!exportCapability.canChooseDirectory) {
          await exportTracks()
          setExportError('この環境では保存先フォルダの選択に対応していないため、既定の保存先に保存しました。')
          return
        }
        const dir = await selectExportDirectory(app, { defaultPath: exportCapability.defaultOutputDir })
        if (dir) {
          await exportTracks(dir)
        }
      } catch (e) {
        console.error('[useMultiAudioPlayer] Failed to choose export directory:', e)
        setExportError(`保存先フォルダの選択に失敗しました:\n${e instanceof Error ? e.message : String(e)}`)
      }
    }, [app, exportCapability.canChooseDirectory, exportCapability.defaultOutputDir, exportTracks]),
    handleApplyToSameSpeakerChange,
    handleBulkSwitchSpeakerChange,
  }
}
