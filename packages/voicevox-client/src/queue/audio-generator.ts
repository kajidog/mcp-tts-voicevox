import type { VoicevoxApi } from '../api'
import type { AudioQuery } from '../types'
import { isBrowser } from '../utils'
import type { AudioFileManager } from './file-manager'
import { type QueueItem, QueueItemStatus } from './types'

/**
 * 音声生成クラス
 * 音声合成処理を担当
 */
export class AudioGenerator {
  private api: VoicevoxApi
  private fileManager: AudioFileManager

  constructor(apiInstance: VoicevoxApi, fileManager: AudioFileManager) {
    this.api = apiInstance
    this.fileManager = fileManager
  }

  /**
   * テキストから音声クエリを生成
   * @param text テキスト
   * @param speaker 話者ID
   * @returns 音声合成クエリ
   */
  public async generateQuery(text: string, speaker: number): Promise<AudioQuery> {
    try {
      const query = await this.api.generateQuery(text, speaker)
      query.prePhonemeLength = 0
      query.postPhonemeLength = 0
      return query
    } catch (error) {
      // APIエラーをそのまま上位に伝播させる
      console.error(`Error generating query: ${error}`)
      throw error
    }
  }

  /**
   * テキストから音声データを生成してアイテムに設定
   * @param item 処理対象のキューアイテム
   * @param updateStatus ステータス更新コールバック関数
   */
  public async generateAudio(
    item: QueueItem,
    updateStatus: (item: QueueItem, status: QueueItemStatus) => void
  ): Promise<void> {
    // PENDING 状態でない場合は処理しない
    if (item.status !== QueueItemStatus.PENDING) return

    try {
      updateStatus(item, QueueItemStatus.GENERATING)
      const query = await this.api.generateQuery(item.text!, item.speaker)

      query.prePhonemeLength = 0
      query.postPhonemeLength = 0

      item.query = query

      const audioData = await this.api.synthesize(query, item.speaker)
      item.audioData = audioData

      // 一時ファイルまたはブラウザの場合はblobURLに保存
      item.tempFile = await this.fileManager.saveTempAudioFile(audioData)

      updateStatus(item, QueueItemStatus.READY)
      return
    } catch (error) {
      console.error(`Error generating audio for item ${item.id}:`, error)
      item.error = error instanceof Error ? error : new Error(String(error))
      updateStatus(item, QueueItemStatus.ERROR)
      throw error
    }
  }

  /**
   * クエリから音声データを生成してアイテムに設定
   * @param item 処理対象のキューアイテム (queryが必須)
   * @param updateStatus ステータス更新コールバック関数
   */
  public async generateAudioFromQuery(
    item: QueueItem,
    updateStatus: (item: QueueItem, status: QueueItemStatus) => void
  ): Promise<void> {
    // PENDING状態でない、またはクエリがない場合は処理しない
    if (item.status !== QueueItemStatus.PENDING || !item.query) return

    try {
      updateStatus(item, QueueItemStatus.GENERATING)
      const audioData = await this.api.synthesize(item.query, item.speaker)

      // 音声データをアイテムに保存
      item.audioData = audioData

      // ブラウザ環境での音声処理を最適化
      if (isBrowser()) {
        try {
          console.debug('音声データ生成完了:', audioData.byteLength, 'bytes')
        } catch (e) {
          console.error('デバッグログ出力エラー:', e)
        }
      }

      // 一時ファイルまたはブラウザの場合はblobURLに保存
      item.tempFile = await this.fileManager.saveTempAudioFile(audioData)

      updateStatus(item, QueueItemStatus.READY)
      return
    } catch (error) {
      console.error(`Error generating audio from query for item ${item.id}:`, error)
      item.error = error instanceof Error ? error : new Error(String(error))
      updateStatus(item, QueueItemStatus.ERROR)
      throw error
    }
  }
}
