import type { App } from '@modelcontextprotocol/ext-apps'
import { useApp } from '@modelcontextprotocol/ext-apps/react'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { useEffect, useRef, useState } from 'react'
import { fetchPlayerStateOnServer } from '../hooks/playerToolClient'
import type { AudioSegment, DictionaryData, MultiPlayerData } from '../types'
import { extractDictionaryData, extractMultiPlayerData, extractPlayerData } from '../utils'
import { DictionaryManager } from './dictionary/DictionaryManager'
import { MultiAudioPlayer } from './MultiAudioPlayer'

interface LoadingProgress {
  completed: number
  total: number
}

const statusBox =
  'mx-4 my-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-sm text-[var(--ui-text)]'

export function VoicevoxPlayer() {
  const [multiPlayerData, setMultiPlayerData] = useState<MultiPlayerData | null>(null)
  const [dictionaryData, setDictionaryData] = useState<DictionaryData | null>(null)
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'ready' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null)
  const appRef = useRef<App | null>(null)
  // 復元検出: viewUUID が localStorage に既存ならアプリ再起動後の復元とみなす
  const isRestoreRef = useRef(false)
  // 現在のプレーヤーインスタンス識別子
  const playerViewUUIDRef = useRef<string | undefined>(undefined)

  const { app, error: appError } = useApp({
    appInfo: { name: 'VOICEVOX Player', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (createdApp: App) => {
      appRef.current = createdApp

      createdApp.ontoolinput = async (_params) => {
        // ツール実行中は待機表示へ。実際の音声合成進捗は MultiAudioPlayer 側で扱う。
        setStatus('waiting')
        setLoadingProgress(null)
      }

      createdApp.ontoolresult = async (result: CallToolResult) => {
        // viewUUID による復元検出（公式パターン: Persisting view state）
        // アプリ再起動時、ホストはキャッシュされた tool result を再送するため、
        // localStorage に UUID が既存なら復元 = autoPlay を無効化
        const meta = (result as any)?._meta
        const viewUUID = meta?.viewUUID as string | undefined
        if (viewUUID) {
          const storageKey = `voicevox-played-${viewUUID}`
          try {
            if (localStorage.getItem(storageKey)) {
              isRestoreRef.current = true
            } else {
              localStorage.setItem(storageKey, '1')
            }
          } catch {
            // localStorage が使えない場合はフォールバック（autoPlay を許可）
          }
        }

        if (result.isError) {
          setStatus('error')
          const errText = result.content?.find((c: { type: string }) => c.type === 'text')
          setErrorMsg(errText && errText.type === 'text' ? errText.text : 'Unknown error')
          return
        }

        const dictionary = extractDictionaryData(result)
        if (dictionary) {
          setDictionaryData(dictionary)
          setMultiPlayerData(null)
          setStatus('ready')
          return
        }
        // speak_player の完了通知（音声データなし）は無視する
        // 音声データは _resynthesize_for_player 経由でのみ受け取る
        const multiData = extractMultiPlayerData(result)
        if (multiData) {
          if (multiData.viewUUID) {
            playerViewUUIDRef.current = multiData.viewUUID
          }
          let restoredSegments = multiData.segments
          if (multiData.viewUUID) {
            try {
              const restoredState = await fetchPlayerStateOnServer(createdApp, { viewUUID: multiData.viewUUID })
              if (restoredState?.segments?.length) {
                restoredSegments = restoredState.segments
              }
            } catch (error) {
              console.warn('[VOICEVOX Player] Failed to restore player state:', error)
            }
          }
          setMultiPlayerData({
            ...multiData,
            segments: restoredSegments,
            autoPlay: isRestoreRef.current ? false : multiData.autoPlay,
          })
          setDictionaryData(null)
          setStatus('ready')
          return
        }

        const data = extractPlayerData(result)
        if (data) {
          const segment: AudioSegment = {
            audioBase64: data.audioBase64,
            text: data.text,
            speaker: data.speaker,
            speakerName: data.speakerName,
            audioQuery: data.audioQuery,
          }
          setMultiPlayerData({
            segments: [segment],
            autoPlay: isRestoreRef.current ? false : data.autoPlay,
          })
          setDictionaryData(null)
          setStatus('ready')
        }
      }

      createdApp.ontoolcancelled = () => {
        setStatus('waiting')
        setMultiPlayerData(null)
        setDictionaryData(null)
        setLoadingProgress(null)
      }

      createdApp.onteardown = async () => {
        return {}
      }

      createdApp.onerror = (err: unknown) => {
        console.error('[VOICEVOX Player] Error:', err)
        setStatus('error')
        setErrorMsg(String(err))
      }
    },
  })

  useEffect(() => {
    if (app) setStatus('waiting')
  }, [app])

  if (appError) {
    return <div className={`${statusBox} border-[var(--ui-danger)] text-[var(--ui-danger)]`}>Connection error: {appError.message}</div>
  }

  if (status === 'connecting') {
    return (
      <div className={`${statusBox} flex items-center gap-2`}>
        <div className="vv-spinner" />
        Connecting...
      </div>
    )
  }

  if (status === 'waiting') {
    return (
      <div className={`${statusBox} space-y-2`}>
        {loadingProgress ? (
          <>
            <span>{`音声を生成中... ${loadingProgress.completed} / ${loadingProgress.total}`}</span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ui-progress-bg)]">
              <div
                className="h-full rounded-full bg-[var(--ui-accent)] transition-[width] duration-150"
                style={{ width: `${(loadingProgress.completed / loadingProgress.total) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <div className="vv-spinner" />
            プレーヤーを準備中...
          </div>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return <div className={`${statusBox} border-[var(--ui-danger)] text-[var(--ui-danger)]`}>{errorMsg}</div>
  }

  if (!appRef.current) return null

  if (multiPlayerData) {
    return (
      <MultiAudioPlayer
        data={multiPlayerData}
        app={appRef.current}
        viewUUID={multiPlayerData.viewUUID ?? playerViewUUIDRef.current}
      />
    )
  }

  if (dictionaryData && appRef.current) {
    return <DictionaryManager app={appRef.current} initialData={dictionaryData} />
  }

  return null
}
