import { ItemStateMachine } from './item-state-machine.js'
import {
  type QueueAction,
  type QueueItemData,
  QueueItemStatus,
  QueueState,
  type QueueStateChangeCallback,
} from './types.js'

/**
 * イベントコールバック型
 */
export interface QueueEventCallbacks {
  onItemAdded?: (item: QueueItemData) => void
  onItemReady?: (item: QueueItemData) => void
  onItemRemoved?: (item: QueueItemData) => void
  onPlaybackStart?: (item: QueueItemData) => void
  onPlaybackComplete?: (item: QueueItemData) => void
  onError?: (item: QueueItemData, error: Error) => void
  onQueueCleared?: () => void
}

/**
 * キュー全体の状態マシン
 * ポーリングではなくイベント駆動で動作
 */
export class QueueStateMachine {
  private state: QueueState = QueueState.IDLE
  private items: Map<string, QueueItemData> = new Map()
  private itemStateMachines: Map<string, ItemStateMachine> = new Map()
  private queue: string[] = [] // アイテムIDの順序管理
  private currentPlayingItemId: string | null = null
  private readonly onStateChange?: QueueStateChangeCallback
  private readonly callbacks: QueueEventCallbacks

  constructor(callbacks: QueueEventCallbacks = {}, onStateChange?: QueueStateChangeCallback) {
    this.callbacks = callbacks
    this.onStateChange = onStateChange
  }

  /**
   * 現在のキュー状態を取得
   */
  getState(): QueueState {
    return this.state
  }

  /**
   * 現在再生中のアイテムIDを取得
   */
  getCurrentPlayingItemId(): string | null {
    return this.currentPlayingItemId
  }

  /**
   * アイテムを取得
   */
  getItem(itemId: string): QueueItemData | undefined {
    return this.items.get(itemId)
  }

  /**
   * 全アイテムを取得（キュー順）
   */
  getAllItems(): QueueItemData[] {
    return this.queue.map((id) => this.items.get(id)).filter((item): item is QueueItemData => item !== undefined)
  }

  /**
   * 次に再生可能なアイテムを取得
   */
  getNextReadyItem(): QueueItemData | undefined {
    for (const id of this.queue) {
      const sm = this.itemStateMachines.get(id)
      if (sm?.isPlayable()) {
        return this.items.get(id)
      }
    }
    return undefined
  }

  /**
   * アクションをディスパッチ
   */
  dispatch(action: QueueAction): void {
    const previousState = this.state

    switch (action.type) {
      case 'ENQUEUE':
        this.handleEnqueue(action.item)
        break
      case 'ITEM_READY':
        this.handleItemReady(action.itemId)
        break
      case 'START_PLAYBACK':
        this.handleStartPlayback()
        break
      case 'PAUSE':
        this.handlePause()
        break
      case 'RESUME':
        this.handleResume()
        break
      case 'PLAYBACK_COMPLETE':
        this.handlePlaybackComplete(action.itemId)
        break
      case 'ERROR':
        this.handleError(action.itemId, action.error)
        break
      case 'CLEAR':
        this.handleClear()
        break
    }

    if (previousState !== this.state && this.onStateChange) {
      this.onStateChange(previousState, this.state)
    }
  }

  /**
   * アイテムの状態マシンを取得
   */
  getItemStateMachine(itemId: string): ItemStateMachine | undefined {
    return this.itemStateMachines.get(itemId)
  }

  /**
   * アイテムのデータを更新
   */
  updateItem(itemId: string, updates: Partial<QueueItemData>): void {
    const item = this.items.get(itemId)
    if (item) {
      Object.assign(item, updates)
    }
  }

  private handleEnqueue(item: QueueItemData): void {
    // アイテムを追加
    this.items.set(item.id, item)
    this.queue.push(item.id)

    // 状態マシンを作成
    const sm = new ItemStateMachine(item.id, item.status, (itemId, oldStatus, newStatus) => {
      const itemData = this.items.get(itemId)
      if (itemData) {
        itemData.status = newStatus
      }
    })
    this.itemStateMachines.set(item.id, sm)

    // 処理中状態に遷移
    if (this.state === QueueState.IDLE) {
      this.state = QueueState.PROCESSING
    }

    this.callbacks.onItemAdded?.(item)
  }

  private handleItemReady(itemId: string): void {
    const item = this.items.get(itemId)
    if (!item) return

    this.callbacks.onItemReady?.(item)

    // アイドルまたは処理中なら、次の再生を試みる
    if (this.state === QueueState.IDLE || this.state === QueueState.PROCESSING) {
      this.tryStartNextPlayback()
    }
  }

  private handleStartPlayback(): void {
    this.tryStartNextPlayback()
  }

  private handlePause(): void {
    if (this.currentPlayingItemId) {
      const sm = this.itemStateMachines.get(this.currentPlayingItemId)
      if (sm?.canTransition('pause')) {
        sm.transition('pause')
        this.state = QueueState.PAUSED
      }
    }
  }

  private handleResume(): void {
    if (this.currentPlayingItemId) {
      const sm = this.itemStateMachines.get(this.currentPlayingItemId)
      if (sm?.canTransition('resume')) {
        sm.transition('resume')
        this.state = QueueState.PLAYING
      }
    }
  }

  private handlePlaybackComplete(itemId: string): void {
    const item = this.items.get(itemId)
    const sm = this.itemStateMachines.get(itemId)

    if (sm?.canTransition('playbackComplete')) {
      sm.transition('playbackComplete')
    }

    // Promise resolverを呼び出し
    if (item?.playbackPromiseResolvers?.endResolve) {
      item.playbackPromiseResolvers.endResolve()
    }

    this.callbacks.onPlaybackComplete?.(item!)

    // キューから削除
    this.removeFromQueue(itemId)

    // 現在の再生をクリア
    if (this.currentPlayingItemId === itemId) {
      this.currentPlayingItemId = null
    }

    // 次のアイテムを再生
    this.tryStartNextPlayback()
  }

  private handleError(itemId: string, error: Error): void {
    const item = this.items.get(itemId)
    const sm = this.itemStateMachines.get(itemId)

    if (item) {
      item.error = error
    }

    if (sm) {
      // 生成中なら generationFailed、再生中なら playbackFailed
      if (sm.isGenerating()) {
        sm.transition('generationFailed')
      } else if (sm.isPlaying()) {
        sm.transition('playbackFailed')
      }
    }

    this.callbacks.onError?.(item!, error)

    // キューから削除
    this.removeFromQueue(itemId)

    // 現在の再生をクリア
    if (this.currentPlayingItemId === itemId) {
      this.currentPlayingItemId = null
    }

    // 次のアイテムを再生
    this.tryStartNextPlayback()
  }

  private handleClear(): void {
    this.items.clear()
    this.itemStateMachines.clear()
    this.queue = []
    this.currentPlayingItemId = null
    this.state = QueueState.IDLE
    this.callbacks.onQueueCleared?.()
  }

  private removeFromQueue(itemId: string): void {
    const index = this.queue.indexOf(itemId)
    if (index !== -1) {
      this.queue.splice(index, 1)
    }
    const item = this.items.get(itemId)
    this.items.delete(itemId)
    this.itemStateMachines.delete(itemId)

    if (item) {
      this.callbacks.onItemRemoved?.(item)
    }
  }

  private tryStartNextPlayback(): void {
    // 既に再生中なら何もしない
    if (this.currentPlayingItemId) {
      return
    }

    const readyItem = this.getNextReadyItem()
    if (readyItem) {
      const sm = this.itemStateMachines.get(readyItem.id)
      if (sm?.canTransition('startPlayback')) {
        sm.transition('startPlayback')
        this.currentPlayingItemId = readyItem.id
        this.state = QueueState.PLAYING

        // Promise resolverを呼び出し
        if (readyItem.playbackPromiseResolvers?.startResolve) {
          readyItem.playbackPromiseResolvers.startResolve()
        }

        this.callbacks.onPlaybackStart?.(readyItem)
      }
    } else if (this.queue.length === 0) {
      this.state = QueueState.IDLE
    } else {
      this.state = QueueState.PROCESSING
    }
  }
}
