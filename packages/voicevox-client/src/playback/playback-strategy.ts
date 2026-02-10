import { isBrowser } from '../utils.js'
import type { PlaybackStrategy } from './types.js'

/**
 * ブラウザ環境用再生戦略
 */
export class BrowserPlaybackStrategy implements PlaybackStrategy {
  private audioElement: HTMLAudioElement | null = null

  supportsStreaming(): boolean {
    return false
  }

  async playFromBuffer(_data: ArrayBuffer, _signal?: AbortSignal): Promise<void> {
    throw new Error('ブラウザ環境ではバッファからの直接再生はサポートされていません')
  }

  async playFromFile(blobUrl: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 中断シグナルのチェック
      if (signal?.aborted) {
        resolve()
        return
      }

      // 既存の音声要素があれば停止
      if (this.audioElement) {
        this.audioElement.pause()
        this.audioElement.src = ''
        this.audioElement.load()
      }

      this.audioElement = new Audio()
      this.audioElement.preload = 'auto'
      this.audioElement.crossOrigin = 'anonymous'

      // 中断処理
      const abortHandler = () => {
        this.stop()
        resolve()
      }
      signal?.addEventListener('abort', abortHandler)

      this.audioElement.onended = () => {
        signal?.removeEventListener('abort', abortHandler)
        resolve()
      }

      this.audioElement.onabort = () => {
        signal?.removeEventListener('abort', abortHandler)
        resolve()
      }

      this.audioElement.onerror = () => {
        signal?.removeEventListener('abort', abortHandler)
        const errorCode = this.audioElement?.error?.code
        const errorMessage = this.audioElement?.error?.message
        if (errorCode !== undefined || errorMessage) {
          reject(new Error(`再生エラー: ${errorMessage || 'Unknown error'} (Code: ${errorCode})`))
        } else {
          // エラーオブジェクトがない場合は継続
          resolve()
        }
      }

      this.audioElement.src = blobUrl
      this.audioElement.load()

      this.audioElement.play().catch((error) => {
        signal?.removeEventListener('abort', abortHandler)
        reject(error)
      })
    })
  }

  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.src = ''
      this.audioElement = null
    }
  }
}

// NodePlaybackStrategyの型だけをエクスポート（実装は動的インポート）
export type { PlaybackStrategy }

/**
 * 現在の環境に適した再生戦略を作成
 * @param useStreaming ストリーミング再生を使用するかどうか
 */
export async function createPlaybackStrategy(useStreaming?: boolean): Promise<PlaybackStrategy> {
  if (isBrowser()) {
    return new BrowserPlaybackStrategy()
  }
  // Node.js環境では動的インポートでNodePlaybackStrategyを読み込む
  const { NodePlaybackStrategy } = await import('./node-playback-strategy.js')
  return new NodePlaybackStrategy(useStreaming)
}
