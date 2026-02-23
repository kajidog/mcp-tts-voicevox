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
  autoAdvanceEnabled: boolean
  currentIndex: number
  isPlaying: boolean
  isEditMode: boolean
  isPreviewLoading: boolean
  segmentCount: number
  showTrackList: boolean
  onNext: () => void
  onPrev: () => void
  onRewind: () => void
  onToggleAutoAdvance: () => void
  onTogglePlay: () => void
  onToggleTrackList: () => void
}

const btnBase =
  'flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))] disabled:cursor-not-allowed disabled:opacity-50'

export function MultiAudioControls({
  autoAdvance,
  autoAdvanceEnabled,
  currentIndex,
  isPlaying,
  isEditMode,
  isPreviewLoading,
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
    <div className="flex items-center gap-2">
      <button type="button" className={btnBase} onClick={onRewind} disabled={isEditMode} title="最初から再生">
        <RewindIcon />
      </button>

      <button type="button" className={btnBase} onClick={onPrev} disabled={isEditMode || currentIndex === 0} title="前へ">
        <PrevIcon />
      </button>

      <button
        type="button"
        className={`${btnBase} h-10 w-10 bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] hover:text-white disabled:cursor-not-allowed`}
        onClick={onTogglePlay}
        disabled={isPreviewLoading}
        title={isPreviewLoading ? 'プレビュー生成中...' : undefined}
      >
        {isPreviewLoading ? <span className="vv-spinner-sm !border-white/40 !border-t-white" /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <button
        type="button"
        className={btnBase}
        onClick={onNext}
        disabled={isEditMode || currentIndex >= segmentCount - 1}
        title="次へ"
      >
        <NextIcon />
      </button>

      <button
        type="button"
        className={`${btnBase} ${autoAdvance
          ? '!border-[var(--ui-accent)] !text-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_14%,var(--ui-bg))] hover:bg-[color-mix(in_oklab,var(--ui-accent)_20%,var(--ui-bg))]'
          : ''}`}
        onClick={onToggleAutoAdvance}
        title={!autoAdvanceEnabled ? '編集中は連続再生を無効化' : autoAdvance ? '連続再生ON' : '連続再生OFF'}
        disabled={!autoAdvanceEnabled}
        aria-pressed={autoAdvance}
      >
        <RepeatIcon />
      </button>

      <button
        type="button"
        className={`ml-auto flex h-9 items-center gap-1 rounded-full border px-3 text-xs transition-colors ${showTrackList
          ? 'border-[var(--ui-accent)] bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))] text-[var(--ui-accent)]'
          : 'border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text-secondary)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-accent)] disabled:cursor-not-allowed disabled:opacity-50'}`}
        onClick={onToggleTrackList}
        disabled={isEditMode}
        title="トラック一覧"
      >
        <span>
          {currentIndex + 1} / {segmentCount}
        </span>
        <span className={`${showTrackList ? 'rotate-180' : ''} transition-transform duration-200`}>
          <ChevronDownIcon />
        </span>
      </button>
    </div>
  )
}
