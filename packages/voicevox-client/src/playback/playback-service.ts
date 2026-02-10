import { createPlaybackStrategy } from './playback-strategy.js'
import type { ActivePlayback, AudioSource, PlaybackCallbacks, PlaybackStrategy } from './types.js'

/**
 * PlaybackServiceの設定オプション
 */
export interface PlaybackServiceOptions {
  /** コールバック関数 */
  callbacks?: PlaybackCallbacks
  /** ストリーミング再生を使用するかどうか */
  useStreaming?: boolean
}

/**
 * 統一された再生サービス
 * 2つのAudioPlayerを1つに統合し、AbortControllerで停止制御
 */
export class PlaybackService {
  private readonly strategyPromise: Promise<PlaybackStrategy>
  private resolvedStrategy: PlaybackStrategy | null = null
  private readonly activePlaybacks: Map<string, ActivePlayback> = new Map()
  private readonly callbacks: PlaybackCallbacks

  constructor(options: PlaybackServiceOptions = {}) {
    this.callbacks = options.callbacks ?? {}
    this.strategyPromise = createPlaybackStrategy(options.useStreaming).then((s) => {
      this.resolvedStrategy = s
      return s
    })
  }

  /**
   * ストリーミング再生が有効かどうか
   */
  isStreamingEnabled(): boolean {
    return this.resolvedStrategy?.supportsStreaming() ?? false
  }

  /**
   * 音声を再生
   * @param itemId アイテムID
   * @param audio 音声ソース（バッファまたはファイル）
   * @param signal 外部からの中断シグナル（オプション）
   */
  async play(itemId: string, audio: AudioSource, signal?: AbortSignal): Promise<void> {
    // 既存の再生を停止
    this.stop(itemId)

    const strategy = await this.strategyPromise

    const controller = new AbortController()
    const activePlayback: ActivePlayback = {
      itemId,
      controller,
      startTime: new Date(),
    }
    this.activePlaybacks.set(itemId, activePlayback)

    // 外部シグナルとの連携
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }

    // 再生のPromiseを作成して追跡
    const playPromise = (async () => {
      try {
        this.callbacks.onStart?.(itemId)

        if (audio.type === 'buffer' && strategy.supportsStreaming()) {
          await strategy.playFromBuffer(audio.data, controller.signal)
        } else if (audio.type === 'file') {
          await strategy.playFromFile(audio.path, controller.signal)
        } else if (audio.type === 'buffer') {
          throw new Error('ストリーミング再生が利用できません。一時ファイルを使用してください。')
        }

        this.callbacks.onComplete?.(itemId)
      } catch (error) {
        // 中断による終了はエラーとして扱わない
        if (!controller.signal.aborted) {
          this.callbacks.onError?.(itemId, error as Error)
          throw error
        }
      } finally {
        this.activePlaybacks.delete(itemId)
      }
    })()

    activePlayback.playPromise = playPromise
    return playPromise
  }

  /**
   * 指定アイテムの再生を停止
   */
  stop(itemId: string): void {
    const playback = this.activePlaybacks.get(itemId)
    if (playback) {
      playback.controller.abort()
      this.activePlaybacks.delete(itemId)
    }
  }

  /**
   * 全ての再生を停止
   */
  stopAll(): void {
    for (const [itemId, playback] of this.activePlaybacks) {
      playback.controller.abort()
    }
    this.activePlaybacks.clear()
    this.resolvedStrategy?.stop()
  }

  /**
   * 全ての再生を停止し、終了まで待機
   */
  async stopAllAndWait(): Promise<void> {
    const promises: Promise<void>[] = []

    for (const [itemId, playback] of this.activePlaybacks) {
      playback.controller.abort()
      if (playback.playPromise) {
        // エラーは無視（中断による終了は正常）
        promises.push(playback.playPromise.catch(() => {}))
      }
    }

    this.resolvedStrategy?.stop()
    await Promise.all(promises)
    this.activePlaybacks.clear()
  }

  /**
   * アクティブな再生があるかどうか
   */
  isPlaying(): boolean {
    return this.activePlaybacks.size > 0
  }

  /**
   * 指定アイテムが再生中かどうか
   */
  isPlayingItem(itemId: string): boolean {
    return this.activePlaybacks.has(itemId)
  }

  /**
   * アクティブな再生の数を取得
   */
  getActiveCount(): number {
    return this.activePlaybacks.size
  }
}
