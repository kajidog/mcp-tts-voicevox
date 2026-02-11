import type { App } from '@modelcontextprotocol/ext-apps'
import { useApp } from '@modelcontextprotocol/ext-apps/react'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { useEffect, useRef, useState } from 'react'
import type { AudioSegment, MultiPlayerData } from '../types'
import { extractMultiPlayerData, extractPlayerData, isMultiSpeakerText, parseStringInput } from '../utils'
import { MultiAudioPlayer } from './MultiAudioPlayer'

export function VoicevoxPlayer() {
  const [multiPlayerData, setMultiPlayerData] = useState<MultiPlayerData | null>(null)
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'ready' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const appRef = useRef<App | null>(null)
  // 復元検出: viewUUID が localStorage に既存ならアプリ再起動後の復元とみなす
  const isRestoreRef = useRef(false)

  const { app, error: appError } = useApp({
    appInfo: { name: 'VOICEVOX Player', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (createdApp: App) => {
      appRef.current = createdApp

      createdApp.ontoolinput = async (params) => {
        setStatus('waiting')
        const args = params.arguments as any
        if (args?.text) {
          try {
            // マルチスピーカー形式かチェック
            if (isMultiSpeakerText(args.text)) {
              const parsed = parseStringInput(args.text)
              const segments = parsed.map((s) => ({
                text: s.text,
                speaker: s.speaker ?? args.speaker ?? 1,
              }))

              const result = await createdApp.callServerTool({
                name: '_resynthesize_for_player',
                arguments: {
                  text: args.text,
                  speaker: segments[0]?.speaker ?? 1,
                  speedScale: args.speedScale ?? 1.0,
                  segments,
                },
              })

              const multiData = extractMultiPlayerData(result)
              if (multiData) {
                setMultiPlayerData({
                  ...multiData,
                  autoPlay: isRestoreRef.current ? false : multiData.autoPlay,
                })
                setStatus('ready')
                return
              }
            }

            // シングルスピーカー（既存動作）
            const result = await createdApp.callServerTool({
              name: '_resynthesize_for_player',
              arguments: {
                text: args.text,
                speaker: args.speaker ?? 1,
                speedScale: args.speedScale ?? 1.0,
              },
            })
            const data = extractPlayerData(result)
            if (data) {
              // シングルデータをマルチデータ形式に変換
              const segment: AudioSegment = {
                audioBase64: data.audioBase64,
                text: data.text,
                speaker: data.speaker,
                speakerName: data.speakerName,
              }
              setMultiPlayerData({
                segments: [segment],
                autoPlay: isRestoreRef.current ? false : data.autoPlay,
              })
              setStatus('ready')
            } else {
              setStatus('error')
              setErrorMsg('Failed to load audio data')
            }
          } catch (e) {
            console.error('[VOICEVOX Player] Failed to fetch audio:', e)
            setStatus('error')
            setErrorMsg('Failed to fetch audio')
          }
        }
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
        // speak_player の完了通知（音声データなし）は無視する
        // 音声データは _resynthesize_for_player 経由でのみ受け取る
        const multiData = extractMultiPlayerData(result)
        if (multiData) {
          setMultiPlayerData({
            ...multiData,
            autoPlay: isRestoreRef.current ? false : multiData.autoPlay,
          })
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
          }
          setMultiPlayerData({
            segments: [segment],
            autoPlay: isRestoreRef.current ? false : data.autoPlay,
          })
          setStatus('ready')
        }
      }

      createdApp.ontoolcancelled = () => {
        setStatus('waiting')
        setMultiPlayerData(null)
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
    return <div className="status error">Connection error: {appError.message}</div>
  }

  if (status === 'connecting') {
    return (
      <div className="loading">
        <div className="spinner" />
        Connecting...
      </div>
    )
  }

  if (status === 'waiting') {
    return (
      <div className="loading">
        <div className="spinner" />
        音声を生成中...
      </div>
    )
  }

  if (status === 'error') {
    return <div className="status error">{errorMsg}</div>
  }

  if (!appRef.current) return null

  if (multiPlayerData) {
    return (
      <MultiAudioPlayer
        data={multiPlayerData}
        app={appRef.current}
      />
    )
  }

  return null
}
