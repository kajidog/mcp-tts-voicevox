import type { MutableRefObject } from 'react'
import type { SpeakerInfo } from '../../types'

interface MultiAudioSpeakerPanelProps {
  currentSpeaker?: number
  groupedSpeakers: Record<string, SpeakerInfo[]>
  portraits: Record<string, string>
  speakerButtonRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>
  onChangeSpeaker: (speakerId: number) => void
}

export function MultiAudioSpeakerPanel({
  currentSpeaker,
  groupedSpeakers,
  portraits,
  speakerButtonRefs,
  onChangeSpeaker,
}: MultiAudioSpeakerPanelProps) {
  return (
    <div className="speaker-panel">
      {Object.entries(groupedSpeakers).map(([charName, styles]) => {
        const groupUuid = styles[0]?.uuid
        const groupPortrait = groupUuid ? portraits[groupUuid] : null

        return (
          <div key={charName} className="speaker-group">
            <div className="speaker-group-header">
              {groupPortrait && (
                <img
                  src={`data:image/png;base64,${groupPortrait}`}
                  alt={charName}
                  className="speaker-portrait-sm"
                />
              )}
              <span className="speaker-group-name">{charName}</span>
            </div>
            <div className="speaker-styles">
              {styles.map((speaker) => (
                <button
                  type="button"
                  key={speaker.id}
                  ref={(el) => {
                    speakerButtonRefs.current[speaker.id] = el
                  }}
                  className={`speaker-style-btn${speaker.id === currentSpeaker ? ' active' : ''}`}
                  onClick={() => onChangeSpeaker(speaker.id)}
                >
                  {speaker.name}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
