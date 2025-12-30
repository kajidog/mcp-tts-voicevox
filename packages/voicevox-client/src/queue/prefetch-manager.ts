/**
 * プリフェッチマネージャー
 * 音声生成のタイミングを制御し、効率的なプリフェッチを実現
 */
export class PrefetchManager {
  private readonly prefetchSize: number
  private generatingCount = 0
  private pendingQueue: string[] = []

  constructor(prefetchSize = 2) {
    this.prefetchSize = prefetchSize
  }

  /**
   * 新しいアイテムを生成待ちキューに追加
   */
  addPendingItem(itemId: string): void {
    if (!this.pendingQueue.includes(itemId)) {
      this.pendingQueue.push(itemId)
    }
  }

  /**
   * 生成開始時に呼び出し
   */
  incrementGenerating(): void {
    this.generatingCount++
  }

  /**
   * 生成完了/エラー時に呼び出し
   */
  decrementGenerating(): void {
    if (this.generatingCount > 0) {
      this.generatingCount--
    }
  }

  /**
   * 次に生成すべきアイテムIDを取得
   * prefetchSize を超えない範囲で返す
   */
  getItemsToGenerate(): string[] {
    const availableSlots = this.prefetchSize - this.generatingCount
    if (availableSlots <= 0 || this.pendingQueue.length === 0) {
      return []
    }
    return this.pendingQueue.slice(0, availableSlots)
  }

  /**
   * アイテムを生成待ちキューから削除
   */
  removeItem(itemId: string): void {
    const index = this.pendingQueue.indexOf(itemId)
    if (index !== -1) {
      this.pendingQueue.splice(index, 1)
    }
  }

  /**
   * 状態をクリア
   */
  clear(): void {
    this.pendingQueue = []
    this.generatingCount = 0
  }

  /**
   * 現在の生成中アイテム数を取得
   */
  getGeneratingCount(): number {
    return this.generatingCount
  }

  /**
   * 生成待ちキューの長さを取得
   */
  getPendingCount(): number {
    return this.pendingQueue.length
  }

  /**
   * prefetchSizeを取得
   */
  getPrefetchSize(): number {
    return this.prefetchSize
  }
}
