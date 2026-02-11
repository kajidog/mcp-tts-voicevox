import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AudioSegment, MultiPlayerData, SpeakerInfo } from '../types'

interface UseMultiAudioPlayerArgs {
  app: App
  data: MultiPlayerData
}

type TransitionDirection = 'up' | 'down'

interface PreviousSegment {
  seg: AudioSegment
  direction: TransitionDirection
}

export function useMultiAudioPlayer({ app, data }: UseMultiAudioPlayerArgs) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])
  const speakerButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const shouldAutoPlayRef = useRef(false)
  const prevIndexRef = useRef(0)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [localSegments, setLocalSegments] = useState<AudioSegment[]>(data.segments)
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([])
  const [portraits, setPortraits] = useState<Record<string, string>>({})
  const [showSpeakerPanel, setShowSpeakerPanel] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [showTrackList, setShowTrackList] = useState(false)
  const [resynthesizingSet, setResynthesizingSet] = useState<Set<number>>(new Set())
  const [prevSegment, setPrevSegment] = useState<PreviousSegment | null>(null)

  const currentSegment = localSegments[currentIndex]
  const audioSrc = currentSegment ? `data:audio/wav;base64,${currentSegment.audioBase64}` : ''
  const isSingleTrack = localSegments.length === 1

  useEffect(() => {
    ;(async () => {
      try {
        const result = await app.callServerTool({
          name: '_get_speakers_for_player',
          arguments: {},
        })
        const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
        if (!textContent || textContent.type !== 'text') return

        const list = JSON.parse(textContent.text) as SpeakerInfo[]
        setSpeakers(list)

        const uuids = [...new Set(list.map((s) => s.uuid).filter(Boolean))]
        const portraitResults = await Promise.all(
          uuids.map(async (uuid) => {
            try {
              const r = await app.callServerTool({
                name: '_get_speaker_icon_for_player',
                arguments: { speakerUuid: uuid },
              })
              const tc = r.content?.find((c: { type: string }) => c.type === 'text')
              if (tc && tc.type === 'text') {
                const d = JSON.parse(tc.text)
                if (d.portrait) return { uuid, portrait: d.portrait as string }
              }
            } catch (e) {
              console.error(`Failed to load portrait for ${uuid}:`, e)
            }
            return null
          })
        )

        const nextPortraits: Record<string, string> = {}
        for (const result of portraitResults) {
          if (result) nextPortraits[result.uuid] = result.portrait
        }
        if (Object.keys(nextPortraits).length > 0) {
          setPortraits(nextPortraits)
        }
      } catch (e) {
        console.error('Failed to load speakers:', e)
      }
    })()
  }, [app])

  useEffect(() => {
    setLocalSegments(data.segments)
    setCurrentIndex(0)
    setCurrentTime(0)
    prevIndexRef.current = 0
    setPrevSegment(null)

    if (data.autoPlay) {
      setTimeout(() => {
        audioRef.current?.play().catch(console.error)
      }, 50)
    }
  }, [data.segments, data.autoPlay])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      if (autoAdvance && currentIndex < localSegments.length - 1) {
        shouldAutoPlayRef.current = true
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
  }, [autoAdvance, currentIndex, localSegments.length])

  useEffect(() => {
    if (currentIndex === prevIndexRef.current) return

    const direction: TransitionDirection = currentIndex > prevIndexRef.current ? 'up' : 'down'
    const oldSegment = localSegments[prevIndexRef.current]
    if (oldSegment) {
      setPrevSegment({ seg: oldSegment, direction })
    }
    prevIndexRef.current = currentIndex

    const timer = setTimeout(() => setPrevSegment(null), 300)
    return () => clearTimeout(timer)
  }, [currentIndex, localSegments])

  useEffect(() => {
    if (shouldAutoPlayRef.current) {
      shouldAutoPlayRef.current = false
      setTimeout(() => {
        audioRef.current?.play().catch(console.error)
      }, 50)
    }

    if (showTrackList) {
      segmentRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentIndex, showTrackList])

  useEffect(() => {
    if (!showSpeakerPanel) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.speaker-panel') && !target.closest('.now-playing-speaker-btn')) {
        setShowSpeakerPanel(false)
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showSpeakerPanel])

  useEffect(() => {
    if (!showSpeakerPanel || !currentSegment) return

    setTimeout(() => {
      const button = speakerButtonRefs.current[currentSegment.speaker]
      if (button) {
        button.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 0)
  }, [showSpeakerPanel, currentSegment?.speaker])

  const getPortrait = useCallback(
    (speakerId: number) => {
      const info = speakers.find((speaker) => speaker.id === speakerId)
      return info?.uuid ? portraits[info.uuid] : null
    },
    [speakers, portraits]
  )

  const changeCurrentSpeaker = useCallback(
    async (newSpeakerId: number) => {
      setShowSpeakerPanel(false)

      const segmentIndex = currentIndex
      const segment = localSegments[segmentIndex]
      if (!segment || segment.speaker === newSpeakerId) return

      setResynthesizingSet((previous) => new Set(previous).add(segmentIndex))
      try {
        const result = await app.callServerTool({
          name: '_resynthesize_for_player',
          arguments: { text: segment.text, speaker: newSpeakerId },
        })
        const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
        if (!textContent || textContent.type !== 'text') return

        const newData = JSON.parse(textContent.text)
        setLocalSegments((previous) =>
          previous.map((value, index) =>
            index === segmentIndex
              ? {
                  ...value,
                  audioBase64: newData.audioBase64,
                  speaker: newData.speaker,
                  speakerName: newData.speakerName,
                }
              : value
          )
        )
      } catch (e) {
        console.error('Failed to resynthesize segment:', e)
      } finally {
        setResynthesizingSet((previous) => {
          const next = new Set(previous)
          next.delete(segmentIndex)
          return next
        })
      }
    },
    [app, currentIndex, localSegments]
  )

  const selectSegment = useCallback((index: number) => {
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setCurrentIndex(index)
    setCurrentTime(0)
  }, [])

  const playSegment = useCallback((index: number) => {
    setCurrentIndex(index)
    setCurrentTime(0)
    setTimeout(() => {
      audioRef.current?.play().catch(console.error)
    }, 50)
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      return
    }
    audio.play().catch(console.error)
  }, [isPlaying])

  const rewind = useCallback(() => {
    setIsPlaying(false)
    if (isSingleTrack) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      return
    }
    setCurrentIndex(0)
    setCurrentTime(0)
  }, [isSingleTrack])

  const goNext = useCallback(() => {
    if (currentIndex >= localSegments.length - 1) return

    const wasPlaying = isPlaying
    setCurrentIndex(currentIndex + 1)
    setCurrentTime(0)
    if (wasPlaying) {
      shouldAutoPlayRef.current = true
    }
  }, [currentIndex, isPlaying, localSegments.length])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return

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

  const currentPortrait = currentSegment ? getPortrait(currentSegment.speaker) : null

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
    isSingleTrack,
    localSegments,
    autoAdvance,
    groupedSpeakers,
    portraits,
    prevSegment,
    resynthesizingSet,
    showSpeakerPanel,
    showTrackList,
    changeCurrentSpeaker,
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
  }
}
