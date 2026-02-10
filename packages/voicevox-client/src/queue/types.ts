import type { AudioQuery, PlaybackOptions } from '../types.js'

/**
 * キューアイテムの状態
 */
export enum QueueItemStatus {
  PENDING = 'pending', // 初期状態
  GENERATING = 'generating', // 音声生成中
  READY = 'ready', // 再生準備完了
  PLAYING = 'playing', // 再生中
  DONE = 'done', // 再生完了
  PAUSED = 'paused', // 一時停止中
  ERROR = 'error', // エラー発生
}

/**
 * キューアイテムの情報
 */
export interface QueueItem {
  id: string // ユニークID
  text: string // 合成するテキスト
  speaker: number // 話者ID
  status: QueueItemStatus // 状態
  createdAt: Date // 作成日時
  audioData?: ArrayBuffer // 生成された音声データ
  tempFile?: string // 一時ファイルパス
  query?: AudioQuery // 音声合成用クエリ
  error?: Error // エラー情報
  options?: PlaybackOptions // 再生オプション
  playbackPromiseResolvers?: {
    startResolve?: () => void
    endResolve?: () => void
  } // 待機処理用Promise resolver
}

/**
 * キュー管理イベントの種類
 */
export enum QueueEventType {
  ITEM_ADDED = 'item_added', // アイテム追加
  ITEM_REMOVED = 'item_removed', // アイテム削除
  ITEM_STATUS_CHANGED = 'item_status_changed', // 状態変更
  ITEM_COMPLETED = 'item_completed', // アイテム再生完了
  QUEUE_CLEARED = 'queue_cleared', // キュークリア
  PLAYBACK_STARTED = 'playback_started', // 再生開始
  PLAYBACK_PAUSED = 'playback_paused', // 再生一時停止
  PLAYBACK_RESUMED = 'playback_resumed', // 再生再開
  PLAYBACK_COMPLETED = 'playback_completed', // 再生完了
  ERROR = 'error', // エラー発生
}

/**
 * キューイベントリスナー関数の型
 */
export type QueueEventListener = (event: QueueEventType, item?: QueueItem) => void

/**
 * キュー管理のインターフェース
 */
export interface QueueManager {
  /**
   * キューに新しいテキストを追加
   */
  enqueueText(text: string, speaker: number, isKara?: boolean): Promise<QueueItem>

  /**
   * キューに音声合成用クエリを追加
   */
  enqueueQuery(query: AudioQuery, speaker: number, options?: any, text?: string): Promise<QueueItem>

  /**
   * キューからアイテムを削除
   */
  removeItem(itemId: string): Promise<boolean>

  /**
   * キューをクリア
   */
  clearQueue(): Promise<void>

  /**
   * 再生を開始
   */
  startPlayback(): Promise<void>

  /**
   * 再生を一時停止
   */
  pausePlayback(): Promise<void>

  /**
   * 再生を再開
   */
  resumePlayback(): Promise<void>

  /**
   * イベントリスナーを追加
   */
  addEventListener(event: QueueEventType, listener: QueueEventListener): void

  /**
   * イベントリスナーを削除
   */
  removeEventListener(event: QueueEventType, listener: QueueEventListener): void

  /**
   * 現在のキュー内のアイテムを取得
   */
  getQueue(): QueueItem[]

  /**
   * 特定のアイテムの状態を取得
   */
  getItemStatus(itemId: string): QueueItemStatus | null
}
