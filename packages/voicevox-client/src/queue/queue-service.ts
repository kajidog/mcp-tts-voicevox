import { v4 as uuidv4 } from 'uuid'
import type { VoicevoxApi } from '../api'
import { PlaybackService } from '../playback'
import type { AudioSource } from '../playback/types'
import { type QueueEventCallbacks, type QueueItemData, QueueItemStatus, QueueStateMachine } from '../state'
import type { AudioQuery, PlaybackOptions } from '../types'
import { isBrowser } from '../utils'
import { AudioGenerator } from './audio-generator'
import { EventManager } from './event-manager'
import { AudioFileManager } from './file-manager'
import { PrefetchManager } from './prefetch-manager'
import { type QueueEventListener, QueueEventType, type QueueItem } from './types'

/**
 * エンキュー結果
 */
export interface EnqueueResult {
  item: QueueItem
  promises: {
    start?: Promise<void>
    end?: Promise<void>
  }
}

/**
 * エンキューオプション
 */
export interface EnqueueOptions extends PlaybackOptions {}

/**
 * QueueServiceの設定オプション
 */
export interface QueueServiceOptions {
  /** プリフェッチサイズ */
  prefetchSize?: number
  /** ストリーミング再生を使用するかどうか */
  useStreaming?: boolean
}

/**
 * キューサービス
 * 状態マシンと再生サービスを統合した簡素化されたキュー管理
 */
export class QueueService {
  private readonly api: VoicevoxApi
  private readonly fileManager: AudioFileManager
  private readonly eventManager: EventManager
  private readonly audioGenerator: AudioGenerator
  private readonly playbackService: PlaybackService
  private readonly stateMachine: QueueStateMachine
  private readonly prefetchManager: PrefetchManager

  private isPlaying = false
  private isPaused = false

  constructor(apiInstance: VoicevoxApi, options: QueueServiceOptions = {}) {
    this.api = apiInstance

    const prefetchSize = options.prefetchSize ?? 2

    // 依存コンポーネントを初期化
    this.fileManager = new AudioFileManager()
    this.eventManager = new EventManager()
    this.audioGenerator = new AudioGenerator(this.api, this.fileManager)
    this.prefetchManager = new PrefetchManager(prefetchSize)

    // 再生サービスを初期化
    this.playbackService = new PlaybackService({
      callbacks: {
        onComplete: (itemId) => this.handlePlaybackComplete(itemId),
        onError: (itemId, error) => this.handlePlaybackError(itemId, error),
      },
      useStreaming: options.useStreaming,
    })

    // 状態マシンを初期化
    const callbacks: QueueEventCallbacks = {
      onItemAdded: (item) => this.emitEvent(QueueEventType.ITEM_ADDED, item as QueueItem),
      onItemReady: (item) => this.handleItemReady(item),
      onItemRemoved: (item) => this.emitEvent(QueueEventType.ITEM_REMOVED, item as QueueItem),
      onPlaybackStart: (item) => this.handlePlaybackStart(item),
      onPlaybackComplete: (item) => this.emitEvent(QueueEventType.ITEM_COMPLETED, item as QueueItem),
      onError: (item, error) => {
        ;(item as QueueItem).error = error
        this.emitEvent(QueueEventType.ERROR, item as QueueItem)
      },
      onQueueCleared: () => this.emitEvent(QueueEventType.QUEUE_CLEARED),
    }
    this.stateMachine = new QueueStateMachine(callbacks)
  }

  /**
   * キューにテキストを追加（統一メソッド）
   */
  async enqueueText(text: string, speaker: number, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    const { item, promises } = this.createQueueItem(text, speaker, options)

    // 状態マシンにアイテムを追加
    this.stateMachine.dispatch({ type: 'ENQUEUE', item })

    // PrefetchManagerに追加（生成はまだ開始しない）
    this.prefetchManager.addPendingItem(item.id)

    // プリフェッチをトリガー（生成タイミングの制御はPrefetchManagerが行う）
    this.triggerPrefetch()

    // 即時再生の処理
    if (options.immediate === true) {
      // 即時再生はアイテムが準備できたら自動的に開始される
    } else if (options.immediate !== false) {
      // デフォルトはキュー処理
      this.processQueue()
    }

    return { item: item as QueueItem, promises }
  }

  /**
   * キューに音声クエリを追加（統一メソッド）
   */
  async enqueueQuery(query: AudioQuery, speaker: number, options: EnqueueOptions = {}, text?: string): Promise<EnqueueResult> {
    const { item, promises } = this.createQueueItem(text || '（クエリから生成）', speaker, options, query)

    // 状態マシンにアイテムを追加
    this.stateMachine.dispatch({ type: 'ENQUEUE', item })

    // PrefetchManagerに追加（生成はまだ開始しない）
    this.prefetchManager.addPendingItem(item.id)

    // プリフェッチをトリガー（生成タイミングの制御はPrefetchManagerが行う）
    this.triggerPrefetch()

    // 即時再生の処理
    if (options.immediate === true) {
      // 即時再生はアイテムが準備できたら自動的に開始される
    } else if (options.immediate !== false) {
      // デフォルトはキュー処理
      this.processQueue()
    }

    return { item: item as QueueItem, promises }
  }

  /**
   * キューからアイテムを削除
   */
  async removeItem(itemId: string): Promise<boolean> {
    const item = this.stateMachine.getItem(itemId)
    if (!item) {
      return false
    }

    // PrefetchManagerからも削除
    this.prefetchManager.removeItem(itemId)

    // 一時ファイルがあれば削除
    if (item.tempFile) {
      await this.fileManager.deleteTempFile(item.tempFile)
    }

    // 再生中なら停止
    this.playbackService.stop(itemId)

    // 状態マシンからは直接削除できないので、エラーとして処理
    this.stateMachine.dispatch({
      type: 'ERROR',
      itemId,
      error: new Error('Item removed by user'),
    })

    return true
  }

  /**
   * キューをクリア
   */
  async clearQueue(): Promise<void> {
    // 現在の再生状態を保存
    const wasPlaying = this.isPlaying

    // 新しい再生が開始されないように、先に再生状態をリセット
    this.isPlaying = false
    this.isPaused = false

    // PrefetchManagerをクリア
    this.prefetchManager.clear()

    // アイテムのコピーを保存（ファイル削除用）
    const itemsToClean = [...this.stateMachine.getAllItems()]

    // 先に状態マシンをクリア（新しい再生を防ぐ）
    // これにより、stopAllAndWait()中にtryStartNextPlayback()が呼ばれても
    // getNextReadyItem()がundefinedを返すので再生が開始されない
    this.stateMachine.dispatch({ type: 'CLEAR' })

    // 全ての再生を停止し、終了まで待機
    await this.playbackService.stopAllAndWait()

    // 一時ファイルを削除
    for (const item of itemsToClean) {
      if (item.tempFile) {
        await this.fileManager.deleteTempFile(item.tempFile)
      }
    }

    // 再生状態を復元（新しいアイテムが再生できるように）
    this.isPlaying = wasPlaying
  }

  /**
   * 再生を開始
   */
  async startPlayback(): Promise<void> {
    if (!this.isPlaying) {
      this.isPlaying = true
      this.isPaused = false
      this.emitEvent(QueueEventType.PLAYBACK_STARTED)
      this.stateMachine.dispatch({ type: 'START_PLAYBACK' })
    }
  }

  /**
   * 再生を一時停止
   */
  async pausePlayback(): Promise<void> {
    if (this.isPlaying && !this.isPaused) {
      this.isPaused = true
      this.stateMachine.dispatch({ type: 'PAUSE' })
      this.emitEvent(QueueEventType.PLAYBACK_PAUSED)
    }
  }

  /**
   * 再生を再開
   */
  async resumePlayback(): Promise<void> {
    if (this.isPlaying && this.isPaused) {
      this.isPaused = false
      this.stateMachine.dispatch({ type: 'RESUME' })
      this.emitEvent(QueueEventType.PLAYBACK_RESUMED)
    }
  }

  /**
   * 次のアイテムを再生
   */
  async playNext(): Promise<void> {
    if (!this.isPlaying) {
      this.isPlaying = true
    }
    this.isPaused = false
    this.processQueue()
  }

  /**
   * イベントリスナーを追加
   */
  addEventListener(event: QueueEventType, listener: QueueEventListener): void {
    this.eventManager.addEventListener(event, listener)
  }

  /**
   * イベントリスナーを削除
   */
  removeEventListener(event: QueueEventType, listener: QueueEventListener): void {
    this.eventManager.removeEventListener(event, listener)
  }

  /**
   * 現在のキュー内のアイテムを取得
   */
  getQueue(): QueueItem[] {
    return this.stateMachine.getAllItems() as QueueItem[]
  }

  /**
   * 特定のアイテムの状態を取得
   */
  getItemStatus(itemId: string): QueueItemStatus | null {
    const item = this.stateMachine.getItem(itemId)
    return item ? item.status : null
  }

  /**
   * AudioGeneratorインスタンスを取得
   */
  getAudioGenerator(): AudioGenerator {
    return this.audioGenerator
  }

  /**
   * FileManagerインスタンスを取得
   */
  getFileManager(): AudioFileManager {
    return this.fileManager
  }

  /**
   * ストリーミング再生が有効かどうか
   */
  isStreamingEnabled(): boolean {
    return this.playbackService.isStreamingEnabled()
  }

  /**
   * APIインスタンスを取得
   */
  getApi(): VoicevoxApi {
    return this.api
  }

  /**
   * 全てのリソースをクリーンアップ
   */
  cleanup(): void {
    // 全ての再生を停止
    this.playbackService.stopAll()

    // PrefetchManagerをクリア
    this.prefetchManager.clear()

    // blobURLをリリース
    if (isBrowser()) {
      this.fileManager.releaseAllBlobUrls()
    }

    // 一時ファイルを削除
    for (const item of this.stateMachine.getAllItems()) {
      if (item.tempFile) {
        this.fileManager.deleteTempFile(item.tempFile)
      }
    }

    // 状態をクリア
    this.stateMachine.dispatch({ type: 'CLEAR' })
    this.isPlaying = false
    this.isPaused = false
  }

  // --- プライベートメソッド ---

  private createQueueItem(
    text: string,
    speaker: number,
    options: EnqueueOptions,
    query?: AudioQuery
  ): { item: QueueItemData; promises: { start?: Promise<void>; end?: Promise<void> } } {
    const playbackPromiseResolvers: any = {}
    const promises: { start?: Promise<void>; end?: Promise<void> } = {}

    if (options.waitForStart) {
      promises.start = new Promise<void>((resolve) => {
        playbackPromiseResolvers.startResolve = resolve
      })
    }
    if (options.waitForEnd) {
      promises.end = new Promise<void>((resolve) => {
        playbackPromiseResolvers.endResolve = resolve
      })
    }

    const item: QueueItemData = {
      id: uuidv4(),
      text,
      speaker,
      status: QueueItemStatus.PENDING,
      createdAt: new Date(),
      query,
      options,
      playbackPromiseResolvers,
    }

    return { item, promises }
  }

  private handleItemReady(_item: QueueItemData): void {
    // キュー処理を開始（アイドル状態の場合）
    if (this.isPlaying && !this.isPaused) {
      this.processQueue()
    }
  }

  /**
   * プリフェッチをトリガー
   * PrefetchManagerから生成すべきアイテムを取得し、生成を開始する
   */
  private triggerPrefetch(): void {
    const itemsToGenerate = this.prefetchManager.getItemsToGenerate()

    for (const itemId of itemsToGenerate) {
      const item = this.stateMachine.getItem(itemId)
      if (!item) continue

      const sm = this.stateMachine.getItemStateMachine(itemId)
      if (!sm) continue

      // 生成待ちキューから削除し、生成中カウントを増やす
      this.prefetchManager.removeItem(itemId)
      this.prefetchManager.incrementGenerating()

      // 生成完了/エラー時のコールバック
      const onComplete = (completedItem: QueueItemData, audioData: ArrayBuffer, tempFile: string) => {
        this.prefetchManager.decrementGenerating()
        this.stateMachine.updateItem(completedItem.id, { audioData, tempFile })
        sm.transition('generationComplete')
        this.stateMachine.dispatch({ type: 'ITEM_READY', itemId: completedItem.id })

        // 次のプリフェッチをトリガー
        this.triggerPrefetch()
      }

      const onError = (errorItem: QueueItemData, error: Error) => {
        this.prefetchManager.decrementGenerating()
        this.stateMachine.dispatch({ type: 'ERROR', itemId: errorItem.id, error })

        // エラー時も次のプリフェッチをトリガー
        this.triggerPrefetch()
      }

      // AudioGeneratorを使用して生成
      if (item.query) {
        this.audioGenerator.generateFromQueryForItem(item, sm, onComplete, onError)
      } else {
        this.audioGenerator.generateForItem(item, sm, onComplete, onError)
      }
    }
  }

  private async handlePlaybackStart(item: QueueItemData): Promise<void> {
    this.emitEvent(QueueEventType.PLAYBACK_STARTED, item as QueueItem)

    // 実際の再生を開始
    const audioSource = this.getAudioSource(item)
    if (audioSource) {
      try {
        await this.playbackService.play(item.id, audioSource)
      } catch (error) {
        // エラーはPlaybackServiceのコールバックで処理される
      }
    }
  }

  private handlePlaybackComplete(itemId: string): void {
    const item = this.stateMachine.getItem(itemId)
    if (item) {
      // 一時ファイルを削除
      if (item.tempFile) {
        this.fileManager.deleteTempFile(item.tempFile)
      }
    }

    this.stateMachine.dispatch({ type: 'PLAYBACK_COMPLETE', itemId })
  }

  private handlePlaybackError(itemId: string, error: Error): void {
    this.stateMachine.dispatch({ type: 'ERROR', itemId, error })
  }

  private getAudioSource(item: QueueItemData): AudioSource | null {
    if (item.audioData && this.playbackService.isStreamingEnabled()) {
      return { type: 'buffer', data: item.audioData }
    }
    if (item.tempFile) {
      return { type: 'file', path: item.tempFile }
    }
    return null
  }

  private processQueue(): void {
    if (!this.isPlaying || this.isPaused) {
      return
    }

    // 既に再生中なら何もしない
    if (this.playbackService.isPlaying()) {
      return
    }

    // 状態マシンに再生開始を要求
    this.stateMachine.dispatch({ type: 'START_PLAYBACK' })

    // プリフェッチをトリガー
    this.triggerPrefetch()
  }

  private emitEvent(event: QueueEventType, item?: QueueItem): void {
    this.eventManager.emitEvent(event, item)
  }
}
