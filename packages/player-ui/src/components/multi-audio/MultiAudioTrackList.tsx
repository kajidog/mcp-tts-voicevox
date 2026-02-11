import type { MutableRefObject } from 'react'
import { EqualizerIcon, PlayIcon } from '../../icons'
import type { AudioSegment } from '../../types'

interface MultiAudioTrackListProps {
  currentIndex: number
  isPlaying: boolean
  resynthesizingSet: Set<number>
  segmentRefs: MutableRefObject<(HTMLDivElement | null)[]>
  segments: AudioSegment[]
  onPlaySegment: (index: number) => void
  onSelectSegment: (index: number) => void
  getPortrait: (speakerId: number) => string | null
}

export function MultiAudioTrackList({
  currentIndex,
  isPlaying,
  resynthesizingSet,
  segmentRefs,
  segments,
  onPlaySegment,
  onSelectSegment,
  getPortrait,
}: MultiAudioTrackListProps) {
  return (
    <div className="track-list-accordion open">
      <div className="segment-list">
        {segments.map((segment, index) => {
          const portrait = getPortrait(segment.speaker)

          return (
            <div
              key={`seg-${segment.speaker}-${index}`}
              className={`segment-item${index === currentIndex ? ' active' : ''}${index === currentIndex && isPlaying ? ' playing' : ''}`}
              ref={(el) => {
                segmentRefs.current[index] = el
              }}
              onClick={() => onSelectSegment(index)}
            >
              <span className="segment-icon">
                {portrait ? (
                  <img
                    src={`data:image/png;base64,${portrait}`}
                    alt={segment.speakerName}
                    className="segment-icon-img"
                  />
                ) : (
                  <span className="segment-icon-fallback">{segment.speakerName?.charAt(0) || '?'}</span>
                )}
              </span>
              <span className="segment-speaker-name">{segment.speakerName}</span>
              <span className="segment-text">{segment.text}</span>
              <span className="segment-actions">
                {resynthesizingSet.has(index) ? (
                  <div className="spinner-sm" />
                ) : index === currentIndex && isPlaying ? (
                  <EqualizerIcon />
                ) : (
                  <button
                    type="button"
                    className="segment-play-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlaySegment(index)
                    }}
                    title="再生"
                  >
                    <PlayIcon />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
