import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback, useEffect, useState } from 'react'
import type { SpeakerInfo } from '../types'

interface SpeakerPanelProps {
  app: App
  speakers: SpeakerInfo[]
  currentSpeaker: number
  showSpeakers: boolean
  onSpeakersLoaded: (speakers: SpeakerInfo[]) => void
  onChangeSpeaker: (speakerId: number) => void
  onToggle: () => void
  portraitIcon?: string | null
}

export function SpeakerPanel({
  app,
  speakers,
  currentSpeaker,
  showSpeakers,
  onSpeakersLoaded,
  onChangeSpeaker,
  onToggle,
  portraitIcon,
}: SpeakerPanelProps) {
  const [portraits, setPortraits] = useState<Record<string, string>>({})

  // スピーカー一覧を取得
  const loadSpeakers = useCallback(async () => {
    if (speakers.length > 0) {
      onToggle()
      return
    }
    try {
      const result = await app.callServerTool({
        name: '_get_speakers_for_player',
        arguments: {},
      })
      const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
      if (textContent && textContent.type === 'text') {
        const list = JSON.parse(textContent.text) as SpeakerInfo[]
        onSpeakersLoaded(list)
        onToggle()
      }
    } catch (e) {
      console.error('Failed to load speakers:', e)
    }
  }, [app, speakers.length, onSpeakersLoaded, onToggle])

  // スピーカーパネル表示時にアイコンを取得
  useEffect(() => {
    if (!showSpeakers || speakers.length === 0) return

    // ユニークなUUIDを取得
    const uuids = [...new Set(speakers.map((s) => s.uuid).filter(Boolean))]
    const missingUuids = uuids.filter((uuid) => !portraits[uuid])

    if (missingUuids.length === 0) return

    // 並列でアイコンを取得
    Promise.all(
      missingUuids.map(async (uuid) => {
        try {
          const result = await app.callServerTool({
            name: '_get_speaker_icon_for_player',
            arguments: { speakerUuid: uuid },
          })
          const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
          if (textContent && textContent.type === 'text') {
            const data = JSON.parse(textContent.text)
            if (data.portrait) {
              return { uuid, portrait: data.portrait as string }
            }
          }
        } catch (e) {
          console.error(`Failed to load portrait for ${uuid}:`, e)
        }
        return null
      })
    ).then((results) => {
      const newPortraits: Record<string, string> = {}
      for (const r of results) {
        if (r) newPortraits[r.uuid] = r.portrait
      }
      if (Object.keys(newPortraits).length > 0) {
        setPortraits((prev) => ({ ...prev, ...newPortraits }))
      }
    })
  }, [showSpeakers, speakers, app, portraits])

  // キャラクター名ごとにグルーピング
  const groupedSpeakers = speakers.reduce(
    (acc, s) => {
      if (!acc[s.characterName]) acc[s.characterName] = []
      acc[s.characterName].push(s)
      return acc
    },
    {} as Record<string, SpeakerInfo[]>
  )

  // 現在のスピーカーのUUIDからポートレートを取得
  const currentSpeakerInfo = speakers.find((s) => s.id === currentSpeaker)
  const headerIcon = portraitIcon || (currentSpeakerInfo?.uuid ? portraits[currentSpeakerInfo.uuid] : null)

  return (
    <>
      <div className="player-header">
        <button type="button" className="speaker-btn" onClick={loadSpeakers} title="スピーカーを変更">
          {headerIcon ? (
            <img
              src={`data:image/png;base64,${headerIcon}`}
              alt="Speaker"
              className="speaker-icon-img"
            />
          ) : (
            <svg viewBox="0 0 24 24" aria-label="Speaker" className="speaker-icon">
              <title>Speaker</title>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          )}
          <span className="speaker-name">{currentSpeakerInfo?.characterName ? `${currentSpeakerInfo.characterName}（${currentSpeakerInfo.name}）` : `Speaker ${currentSpeaker}`}</span>
          <span className="speaker-chevron">{showSpeakers ? '\u25B2' : '\u25BC'}</span>
        </button>
      </div>

      {showSpeakers && (
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
                      className="speaker-portrait"
                    />
                  )}
                  <span className="speaker-group-name">{charName}</span>
                </div>
                <div className="speaker-styles">
                  {styles.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      className={`speaker-style-btn ${s.id === currentSpeaker ? 'active' : ''}`}
                      onClick={() => onChangeSpeaker(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
