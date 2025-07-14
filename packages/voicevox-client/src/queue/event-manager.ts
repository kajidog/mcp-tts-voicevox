import { type QueueEventListener, QueueEventType, type QueueItem } from './types'

/**
 * イベント管理クラス
 * キュー関連イベントの管理と発火を担当
 */
export class EventManager {
  private eventListeners: Map<QueueEventType, QueueEventListener[]> = new Map()

  constructor() {
    // イベントタイプごとのリスナー配列を初期化
    for (const eventType of Object.values(QueueEventType)) {
      this.eventListeners.set(eventType, [])
    }
  }

  /**
   * イベントリスナーを追加
   * @param event イベントタイプ
   * @param listener リスナー関数
   */
  public addEventListener(event: QueueEventType, listener: QueueEventListener): void {
    const listeners = this.eventListeners.get(event) || []
    if (!listeners.includes(listener)) {
      listeners.push(listener)
      this.eventListeners.set(event, listeners)
    }
  }

  /**
   * イベントリスナーを削除
   * @param event イベントタイプ
   * @param listener リスナー関数
   */
  public removeEventListener(event: QueueEventType, listener: QueueEventListener): void {
    const listeners = this.eventListeners.get(event) || []
    const index = listeners.indexOf(listener)

    if (index !== -1) {
      listeners.splice(index, 1)
      this.eventListeners.set(event, listeners)
    }
  }

  /**
   * イベントを発火
   * @param event 発火するイベントのタイプ
   * @param item 関連するキューアイテム（オプション）
   */
  public emitEvent(event: QueueEventType, item?: QueueItem): void {
    const listeners = this.eventListeners.get(event) || []
    for (const listener of listeners) {
      try {
        listener(event, item)
      } catch (error) {
        console.error(`イベントリスナーの実行中にエラーが発生しました (${event}):`, error)
      }
    }
  }
}
