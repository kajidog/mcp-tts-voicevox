import { useCallback, useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from '../icons'
import { formatTime } from '../utils'

interface AudioControlsProps {
  audioSrc: string
  autoPlay: boolean
  onEnded?: () => void
}

const iconBtnBase =
  'flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg)] text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))] disabled:cursor-not-allowed disabled:opacity-50'

export function AudioControls({ audioSrc, autoPlay, onEnded }: AudioControlsProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      onEnded?.()
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
  }, [onEnded])

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch((e: Error) => {
        console.warn('[VOICEVOX Player] Autoplay blocked:', e)
      })
    }
  }, [autoPlay, audioSrc])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(console.error)
    }
  }, [isPlaying])

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current
      if (!audio || !duration) return
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      audio.currentTime = ratio * duration
    },
    [duration]
  )

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-accent)] text-white transition-colors hover:bg-[var(--ui-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={togglePlay}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className="h-2 cursor-pointer rounded-full bg-[var(--ui-progress-bg)]"
            onClick={handleProgressClick}
          >
            <div
              className="h-full rounded-full bg-[var(--ui-accent)] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--ui-text-secondary)]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      <audio ref={audioRef} src={audioSrc} preload="auto" />
    </>
  )
}
