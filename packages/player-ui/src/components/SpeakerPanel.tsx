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

const chipBtn =
  'rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-2 py-1 text-xs text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))] disabled:cursor-not-allowed disabled:opacity-60'

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

  useEffect(() => {
    if (!showSpeakers || speakers.length === 0) return

    const uuids = [...new Set(speakers.map((s) => s.uuid).filter(Boolean))]
    const missingUuids = uuids.filter((uuid) => !portraits[uuid])

    if (missingUuids.length === 0) return

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

  const groupedSpeakers = speakers.reduce(
    (acc, s) => {
      if (!acc[s.characterName]) acc[s.characterName] = []
      acc[s.characterName].push(s)
      return acc
    },
    {} as Record<string, SpeakerInfo[]>
  )

  const currentSpeakerInfo = speakers.find((s) => s.id === currentSpeaker)
  const headerIcon = portraitIcon || (currentSpeakerInfo?.uuid ? portraits[currentSpeakerInfo.uuid] : null)

  return (
    <>
      <div className="flex items-center">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-1.5 text-left text-sm text-[var(--ui-text)] transition-colors hover:border-[var(--ui-accent)] hover:bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))]"
          onClick={loadSpeakers}
          title="スピーカーを変更"
        >
          <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-tag-bg)] text-[var(--ui-accent)]">
            {headerIcon ? (
              <img src={`data:image/png;base64,${headerIcon}`} alt="Speaker" className="h-full w-full object-cover object-[center_top]" />
            ) : (
              <svg viewBox="0 0 24 24" aria-label="Speaker" className="h-4 w-4 fill-current">
                <title>Speaker</title>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {currentSpeakerInfo?.characterName
              ? `${currentSpeakerInfo.characterName}（${currentSpeakerInfo.name}）`
              : `Speaker ${currentSpeaker}`}
          </span>
          <span className="text-xs text-[var(--ui-text-secondary)]">{showSpeakers ? '▲' : '▼'}</span>
        </button>
      </div>

      {showSpeakers && (
        <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2">
          {Object.entries(groupedSpeakers).map(([charName, styles]) => {
            const groupUuid = styles[0]?.uuid
            const groupPortrait = groupUuid ? portraits[groupUuid] : null

            return (
              <div key={charName} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ui-text-secondary)]">
                  {groupPortrait && (
                    <img
                      src={`data:image/png;base64,${groupPortrait}`}
                      alt={charName}
                      className="h-5 w-5 rounded-full border border-[var(--ui-border)] object-cover object-[center_top]"
                    />
                  )}
                  <span>{charName}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {styles.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      className={`${chipBtn} ${s.id === currentSpeaker
                        ? '!border-[var(--ui-accent)] !text-[var(--ui-accent)] !bg-[color-mix(in_oklab,var(--ui-accent)_12%,var(--ui-bg))] font-semibold'
                        : ''}`}
                      aria-pressed={s.id === currentSpeaker}
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
