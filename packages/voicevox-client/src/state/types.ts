import type { AudioQuery, PlaybackOptions } from '../types'

/**
 * キューアイテムの状態
 */
export enum QueueItemStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  READY = 'ready',
  PLAYING = 'playing',
  DONE = 'done',
  PAUSED = 'paused',
  ERROR = 'error',
}

/**
 * 状態遷移アクション
 */
export type ItemAction =
  | 'startGeneration'
  | 'generationComplete'
  | 'generationFailed'
  | 'startPlayback'
  | 'pause'
  | 'resume'
  | 'playbackComplete'
  | 'playbackFailed'

/**
 * 状態遷移定義
 */
export interface StateTransition {
  from: QueueItemStatus
  to: QueueItemStatus
  action: ItemAction
}

/**
 * キュー全体の状態
 */
export enum QueueState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  PLAYING = 'playing',
  PAUSED = 'paused',
}

/**
 * キューアクション
 */
export type QueueAction =
  | { type: 'ENQUEUE'; item: QueueItemData }
  | { type: 'ITEM_READY'; itemId: string }
  | { type: 'START_PLAYBACK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'PLAYBACK_COMPLETE'; itemId: string }
  | { type: 'ERROR'; itemId: string; error: Error }
  | { type: 'CLEAR' }

/**
 * キューアイテムデータ（状態マシン用）
 */
export interface QueueItemData {
  id: string
  text: string
  speaker: number
  status: QueueItemStatus
  createdAt: Date
  audioData?: ArrayBuffer
  tempFile?: string
  query?: AudioQuery
  error?: Error
  options?: PlaybackOptions
  playbackPromiseResolvers?: {
    startResolve?: () => void
    endResolve?: () => void
  }
}

/**
 * 状態変更コールバック
 */
export type StateChangeCallback = (itemId: string, oldStatus: QueueItemStatus, newStatus: QueueItemStatus) => void

/**
 * キュー状態変更コールバック
 */
export type QueueStateChangeCallback = (oldState: QueueState, newState: QueueState) => void
