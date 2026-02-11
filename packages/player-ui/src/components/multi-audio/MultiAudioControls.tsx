import {
  ChevronDownIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RewindIcon,
} from '../../icons'

interface MultiAudioControlsProps {
  autoAdvance: boolean
  currentIndex: number
  isPlaying: boolean
  isSingleTrack: boolean
  segmentCount: number
  showTrackList: boolean
  onNext: () => void
  onPrev: () => void
  onRewind: () => void
  onToggleAutoAdvance: () => void
  onTogglePlay: () => void
  onToggleTrackList: () => void
}

export function MultiAudioControls({
  autoAdvance,
  currentIndex,
  isPlaying,
  isSingleTrack,
  segmentCount,
  showTrackList,
  onNext,
  onPrev,
  onRewind,
  onToggleAutoAdvance,
  onTogglePlay,
  onToggleTrackList,
}: MultiAudioControlsProps) {
  return (
    <div className="player-controls">
      {!isSingleTrack && (
        <button type="button" className="skip-btn" onClick={onRewind} title="最初から再生">
          <RewindIcon />
        </button>
      )}

      {!isSingleTrack && (
        <button type="button" className="skip-btn" onClick={onPrev} disabled={currentIndex === 0} title="前へ">
          <PrevIcon />
        </button>
      )}

      <button type="button" className="play-btn" onClick={onTogglePlay}>
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {!isSingleTrack && (
        <button
          type="button"
          className="skip-btn"
          onClick={onNext}
          disabled={currentIndex >= segmentCount - 1}
          title="次へ"
        >
          <NextIcon />
        </button>
      )}

      {!isSingleTrack && (
        <button
          type="button"
          className={`auto-advance-btn${autoAdvance ? ' active' : ''}`}
          onClick={onToggleAutoAdvance}
          title={autoAdvance ? '連続再生ON' : '連続再生OFF'}
        >
          <RepeatIcon />
        </button>
      )}

      {!isSingleTrack && (
        <button
          type="button"
          className={`track-list-toggle-btn${showTrackList ? ' active' : ''}`}
          onClick={onToggleTrackList}
          title="トラック一覧"
        >
          <span className="track-counter">
            {currentIndex + 1} / {segmentCount}
          </span>
          <span className={`track-list-chevron${showTrackList ? ' open' : ''}`}>
            <ChevronDownIcon />
          </span>
        </button>
      )}
    </div>
  )
}
