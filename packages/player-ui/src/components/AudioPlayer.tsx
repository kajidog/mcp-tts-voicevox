import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback, useState } from 'react'
import type { PlayerData, SpeakerInfo } from '../types'
import { AudioControls } from './AudioControls'
import { SpeakerPanel } from './SpeakerPanel'

interface AudioPlayerProps {
  data: PlayerData
  app: App
  onDataUpdate: (data: PlayerData) => void
}

export function AudioPlayer({ data, app, onDataUpdate }: AudioPlayerProps) {
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([])
  const [showSpeakers, setShowSpeakers] = useState(false)
  const [isResynthesizing, setIsResynthesizing] = useState(false)

  const audioSrc = `data:audio/wav;base64,${data.audioBase64}`

  // スピーカー変更して再合成
  const changeSpeaker = useCallback(
    async (newSpeakerId: number) => {
      if (newSpeakerId === data.speaker) {
        setShowSpeakers(false)
        return
      }
      setIsResynthesizing(true)
      setShowSpeakers(false)
      try {
        const result = await app.callServerTool({
          name: '_resynthesize_for_player',
          arguments: {
            text: data.text,
            speaker: newSpeakerId,
            speedScale: data.speedScale ?? 1.0,
          },
        })
        const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
        if (textContent && textContent.type === 'text') {
          const newData = JSON.parse(textContent.text) as PlayerData
          onDataUpdate(newData)
        }
      } catch (e) {
        console.error('Failed to resynthesize:', e)
      } finally {
        setIsResynthesizing(false)
      }
    },
    [app, data.speaker, data.text, data.speedScale, onDataUpdate]
  )

  return (
    <div className="mx-4 my-3 flex flex-col gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-[var(--ui-text)]">
      <SpeakerPanel
        app={app}
        speakers={speakers}
        currentSpeaker={data.speaker}
        showSpeakers={showSpeakers}
        onSpeakersLoaded={setSpeakers}
        onChangeSpeaker={changeSpeaker}
        onToggle={() => setShowSpeakers((v) => !v)}
      />

      {isResynthesizing && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-xs text-[var(--ui-text-secondary)]">
          <div className="vv-spinner" />
          スピーカーを変更中...
        </div>
      )}

      {data.text && !isResynthesizing && (
        <div className="max-h-28 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--ui-text)]">
          {data.text}
        </div>
      )}

      {!isResynthesizing && (
        <AudioControls audioSrc={audioSrc} autoPlay={data.autoPlay} />
      )}
    </div>
  )
}
