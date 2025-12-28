/**
 * 音声ソースの種類
 */
export type AudioSource = { type: 'buffer'; data: ArrayBuffer } | { type: 'file'; path: string }

/**
 * 再生戦略インターフェース
 */
export interface PlaybackStrategy {
  /**
   * ストリーミング再生をサポートしているか
   */
  supportsStreaming(): boolean

  /**
   * バッファから直接再生
   */
  playFromBuffer(data: ArrayBuffer, signal?: AbortSignal): Promise<void>

  /**
   * ファイルパス/URLから再生
   */
  playFromFile(path: string, signal?: AbortSignal): Promise<void>

  /**
   * 再生を停止
   */
  stop(): void
}

/**
 * 再生イベントコールバック
 */
export interface PlaybackCallbacks {
  onStart?: (itemId: string) => void
  onComplete?: (itemId: string) => void
  onError?: (itemId: string, error: Error) => void
}

/**
 * アクティブな再生情報
 */
export interface ActivePlayback {
  itemId: string
  controller: AbortController
  startTime: Date
}
