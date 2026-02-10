import { type ItemAction, QueueItemStatus, type StateChangeCallback, type StateTransition } from './types.js'

/**
 * 有効な状態遷移の定義
 */
const VALID_TRANSITIONS: StateTransition[] = [
  // 生成フロー
  { from: QueueItemStatus.PENDING, to: QueueItemStatus.GENERATING, action: 'startGeneration' },
  { from: QueueItemStatus.GENERATING, to: QueueItemStatus.READY, action: 'generationComplete' },
  { from: QueueItemStatus.GENERATING, to: QueueItemStatus.ERROR, action: 'generationFailed' },

  // 再生フロー
  { from: QueueItemStatus.READY, to: QueueItemStatus.PLAYING, action: 'startPlayback' },
  { from: QueueItemStatus.PLAYING, to: QueueItemStatus.PAUSED, action: 'pause' },
  { from: QueueItemStatus.PAUSED, to: QueueItemStatus.PLAYING, action: 'resume' },
  { from: QueueItemStatus.PLAYING, to: QueueItemStatus.DONE, action: 'playbackComplete' },
  { from: QueueItemStatus.PLAYING, to: QueueItemStatus.ERROR, action: 'playbackFailed' },

  // 一時停止からの完了（スキップ時など）
  { from: QueueItemStatus.PAUSED, to: QueueItemStatus.DONE, action: 'playbackComplete' },
]

/**
 * アイテム単位の状態マシン
 */
export class ItemStateMachine {
  private currentState: QueueItemStatus
  private readonly itemId: string
  private readonly onStateChange?: StateChangeCallback

  constructor(
    itemId: string,
    initialState: QueueItemStatus = QueueItemStatus.PENDING,
    onStateChange?: StateChangeCallback
  ) {
    this.itemId = itemId
    this.currentState = initialState
    this.onStateChange = onStateChange
  }

  /**
   * 現在の状態を取得
   */
  getState(): QueueItemStatus {
    return this.currentState
  }

  /**
   * アイテムIDを取得
   */
  getId(): string {
    return this.itemId
  }

  /**
   * 指定アクションで遷移可能か確認
   */
  canTransition(action: ItemAction): boolean {
    return VALID_TRANSITIONS.some((t) => t.from === this.currentState && t.action === action)
  }

  /**
   * 状態遷移を実行
   * @returns 遷移が成功したかどうか
   */
  transition(action: ItemAction): boolean {
    const validTransition = VALID_TRANSITIONS.find((t) => t.from === this.currentState && t.action === action)

    if (!validTransition) {
      console.warn(`Invalid state transition: ${this.currentState} -> ${action} for item ${this.itemId}`)
      return false
    }

    const oldState = this.currentState
    this.currentState = validTransition.to

    if (this.onStateChange) {
      this.onStateChange(this.itemId, oldState, this.currentState)
    }

    return true
  }

  /**
   * 現在の状態から遷移可能なアクション一覧を取得
   */
  getAvailableActions(): ItemAction[] {
    return VALID_TRANSITIONS.filter((t) => t.from === this.currentState).map((t) => t.action)
  }

  /**
   * 状態が完了状態（DONE または ERROR）かどうか
   */
  isTerminal(): boolean {
    return this.currentState === QueueItemStatus.DONE || this.currentState === QueueItemStatus.ERROR
  }

  /**
   * 再生可能な状態かどうか
   */
  isPlayable(): boolean {
    return this.currentState === QueueItemStatus.READY
  }

  /**
   * 生成中かどうか
   */
  isGenerating(): boolean {
    return this.currentState === QueueItemStatus.GENERATING
  }

  /**
   * 再生中かどうか
   */
  isPlaying(): boolean {
    return this.currentState === QueueItemStatus.PLAYING
  }
}
