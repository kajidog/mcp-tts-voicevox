import { ChevronDownIcon, EqualizerIcon } from '../../icons'
import type { AudioSegment } from '../../types'
import { formatTime } from '../../utils'

interface PreviousSegment {
  seg: AudioSegment
  direction: 'up' | 'down'
}

interface NowPlayingRowProps {
  currentSegment?: AudioSegment
  currentPortrait: string | null
  currentTime: number
  duration: number
  isPlaying: boolean
  onToggleSpeakerPanel: () => void
  prevSegment: PreviousSegment | null
}

export function NowPlayingRow({
  currentSegment,
  currentPortrait,
  currentTime,
  duration,
  isPlaying,
  onToggleSpeakerPanel,
  prevSegment,
}: NowPlayingRowProps) {
  return (
    <div className="now-playing-row">
      <button
        type="button"
        className="now-playing-speaker-btn"
        onClick={onToggleSpeakerPanel}
        title="スピーカーを変更"
      >
        <span className="now-playing-speaker-btn-icon">
          {currentPortrait ? (
            <img
              src={`data:image/png;base64,${currentPortrait}`}
              alt={currentSegment?.speakerName}
              className="now-playing-icon-img"
            />
          ) : (
            <span className="now-playing-icon-fallback">{currentSegment?.speakerName?.charAt(0) || '?'}</span>
          )}
        </span>
        <span className="now-playing-speaker-btn-name">{currentSegment?.speakerName}</span>
        <span className="now-playing-speaker-btn-chevron">
          <ChevronDownIcon />
        </span>
      </button>

      <div className="now-playing">
        {prevSegment && (
          <div className={`now-playing-content now-playing-exit exit-${prevSegment.direction}`}>
            <span className="now-playing-text">{prevSegment.seg.text}</span>
          </div>
        )}
        <div className={`now-playing-content${prevSegment ? ` enter-${prevSegment.direction}` : ''}`}>
          {currentSegment && <span className="now-playing-text">{currentSegment.text}</span>}
        </div>
      </div>

      <span className="now-playing-status">
        {isPlaying && <EqualizerIcon />}
        <span className="playback-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </span>
    </div>
  )
}
