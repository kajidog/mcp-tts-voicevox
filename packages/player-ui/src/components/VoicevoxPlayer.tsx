import type { App } from '@modelcontextprotocol/ext-apps'
import { useApp } from '@modelcontextprotocol/ext-apps/react'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { useEffect, useRef, useState } from 'react'
import { loadLocalSnapshot, mergeLocalAudioSegments } from '../hooks/playerStateRecovery'
import { fetchDictionaryWords, fetchPlayerViewState } from '../hooks/playerToolClient'
import type { DictionaryData, MultiPlayerData } from '../types'
import { extractViewUUID, isDictionaryResult } from '../utils'
import { DictionaryManager } from './dictionary/DictionaryManager'
import { MultiAudioPlayer } from './MultiAudioPlayer'

const statusBox =
  'mx-4 my-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-sm text-[var(--ui-text)]'

const DICTIONARY_NOTICE = '辞書変更は既存トラックに自動反映されません。Playerで再生成すると反映されます。'

export function VoicevoxPlayer() {
  const [multiPlayerData, setMultiPlayerData] = useState<MultiPlayerData | null>(null)
  const [dictionaryData, setDictionaryData] = useState<DictionaryData | null>(null)
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'ready' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
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
      }

      // ホストは content テキストしかUIへ転送しないため、結果テキストから
      // viewUUID を読み取り、データ本体はサーバーツールで取得するプル型にしている。
      createdApp.ontoolresult = async (result: CallToolResult) => {
        if (result.isError) {
          setStatus('error')
          const errText = result.content?.find((c: { type: string }) => c.type === 'text')
          setErrorMsg(errText && errText.type === 'text' ? errText.text : 'Unknown error')
          return
        }

        try {
          if (isDictionaryResult(result)) {
            const words = await fetchDictionaryWords(createdApp)
            setDictionaryData({ words, notice: DICTIONARY_NOTICE })
            setMultiPlayerData(null)
            setStatus('ready')
            return
          }

          const viewUUID = extractViewUUID(result)
          if (!viewUUID) {
            setStatus('error')
            setErrorMsg('ツール結果から viewUUID を読み取れませんでした（サーバーとUIのバージョン不一致の可能性）')
            return
          }
          playerViewUUIDRef.current = viewUUID

          // viewUUID による復元検出（公式パターン: Persisting view state）
          // アプリ再起動時、ホストはキャッシュされた tool result を再送するため、
          // localStorage に UUID が既存なら復元 = autoPlay を無効化
          const storageKey = `voicevox-played-${viewUUID}`
          try {
            if (localStorage.getItem(storageKey)) {
              isRestoreRef.current = true
            } else {
              localStorage.setItem(storageKey, '1')
            }
          } catch {
            // localStorage が使えない場合は autoPlay を許可したまま続行
          }

          const state = await fetchPlayerViewState(createdApp, viewUUID)
          if (!state) {
            setStatus('error')
            setErrorMsg(
              'このプレーヤーのデータは失われました。もう一度読み上げを実行すると、新しいプレーヤーが開きます。'
            )
            return
          }
          setMultiPlayerData({
            segments: mergeLocalAudioSegments(state.segments, loadLocalSnapshot(viewUUID)),
            autoPlay: isRestoreRef.current ? false : state.autoPlay,
            viewUUID,
          })
          setDictionaryData(null)
          setStatus('ready')
        } catch (error) {
          setStatus('error')
          setErrorMsg(`プレーヤー状態の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      createdApp.ontoolcancelled = () => {
        setStatus('error')
        setErrorMsg('ツール呼び出しがキャンセルされました。もう一度お試しください。')
        setMultiPlayerData(null)
        setDictionaryData(null)
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
    return (
      <div className={`${statusBox} border-[var(--ui-danger)] text-[var(--ui-danger)]`}>
        Connection error: {appError.message}
      </div>
    )
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
      <div className={`${statusBox} flex items-center gap-2`}>
        <div className="vv-spinner" />
        プレーヤーを準備中...
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
