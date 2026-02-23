import { EqualizerIcon } from '../../icons'
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
  isSpeakerPanelOpen: boolean
  onToggleSpeakerPanel: () => void
  prevSegment: PreviousSegment | null
}

export function NowPlayingRow({
  currentSegment,
  currentPortrait,
  currentTime,
  duration,
  isPlaying,
  isSpeakerPanelOpen,
  onToggleSpeakerPanel,
  prevSegment,
}: NowPlayingRowProps) {
  const enterClass = prevSegment ? `now-playing-enter-${prevSegment.direction}` : ''
  const exitClass = prevSegment ? `now-playing-exit-${prevSegment.direction}` : ''

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1 text-left transition-colors ${isSpeakerPanelOpen
          ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))]'
          : 'border-[var(--ui-border)] bg-[var(--ui-button-bg)] hover:border-[var(--ui-accent)]'}`}
        onClick={onToggleSpeakerPanel}
        title="スピーカー・詳細"
      >
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-tag-bg)]">
          {currentPortrait ? (
            <img
              src={`data:image/png;base64,${currentPortrait}`}
              alt={currentSegment?.speakerName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs font-semibold text-[var(--ui-text-secondary)]">{currentSegment?.speakerName?.charAt(0) || '?'}</span>
          )}
        </span>
        <span className="max-w-28 truncate text-xs font-medium text-[var(--ui-text)]">{currentSegment?.speakerName}</span>
        <span className="text-[var(--ui-text-secondary)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor" /></svg>
        </span>
      </button>

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-2">
        {prevSegment && (
          <div className={`absolute inset-0 px-3 py-2 ${exitClass}`}>
            <span className="block truncate text-sm text-[var(--ui-text-secondary)]">{prevSegment.seg.text}</span>
          </div>
        )}
        <div className={`${enterClass}`}>
          {currentSegment && <span className="block truncate text-sm text-[var(--ui-text)]">{currentSegment.text}</span>}
        </div>
      </div>

      <span className="flex items-center gap-1 text-[11px] text-[var(--ui-text-secondary)]">
        {isPlaying && <EqualizerIcon />}
        <span className="tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </span>
    </div>
  )
}
