import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoicevoxApi } from '../../api'
import type { AudioQuery, PlaybackOptions } from '../../types'
import { VoicevoxQueueManager } from '../manager'
import { QueueEventType, QueueItemStatus } from '../types'

// モックオブジェクト
const mockApi = {
  generateQuery: vi.fn(),
  synthesize: vi.fn(),
  getSpeakers: vi.fn(),
  getSpeakerInfo: vi.fn(),
} as unknown as VoicevoxApi

// テスト用のオーディオクエリ
const testQuery: AudioQuery = {
  accent_phrases: [],
  speedScale: 1.0,
  pitchScale: 0.0,
  intonationScale: 1.0,
  volumeScale: 1.0,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  outputSamplingRate: 24000,
  outputStereo: false,
}

// オーディオプレイヤーのモック
vi.mock('../audio-player', () => ({
  AudioPlayer: vi.fn().mockImplementation(() => ({
    playAudio: vi.fn().mockImplementation((filePath: string) => {
      // 短時間で再生完了をシミュレート
      return new Promise((resolve) => setTimeout(resolve, 50))
    }),
  })),
}))

// ファイルマネージャーのモック
vi.mock('../file-manager', () => ({
  AudioFileManager: vi.fn().mockImplementation(() => ({
    saveTempAudioFile: vi.fn().mockResolvedValue('/tmp/test-audio.wav'),
    deleteTempFile: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe('VoicevoxQueueManager - 再生タイミングテスト', () => {
  let queueManager: VoicevoxQueueManager

  beforeEach(async () => {
    vi.clearAllMocks()

    // APIモックの設定
    ;(mockApi.generateQuery as any).mockResolvedValue(testQuery)
    ;(mockApi.synthesize as any).mockResolvedValue(new ArrayBuffer(1024))

    queueManager = new VoicevoxQueueManager(mockApi, 2)

    // デフォルトで再生を開始状態にする
    await queueManager.startPlayback()
  })

  afterEach(async () => {
    // クリーンアップ
    await queueManager.clearQueue()
  })

  describe('immediate オプションのテスト', () => {
    it('immediate=true の場合、キューに追加とともにオプションが設定される', async () => {
      const options: PlaybackOptions = { immediate: true }

      const { item } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(item.options?.immediate).toBe(true)
    })

    it('immediate=false の場合、オプションが正しく設定される', async () => {
      const options: PlaybackOptions = { immediate: false }

      const { item } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(item.options?.immediate).toBe(false)
    })
  })

  describe('waitForStart オプションのテスト', () => {
    it('waitForStart=true の場合、start promiseが作成される', async () => {
      const options: PlaybackOptions = { waitForStart: true }

      const { promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(promises.start).toBeDefined()
    })

    it('waitForStart=false の場合、start promiseが作成されない', async () => {
      const options: PlaybackOptions = { waitForStart: false }

      const { promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(promises.start).toBeUndefined()
    })
  })

  describe('waitForEnd オプションのテスト', () => {
    it('waitForEnd=true の場合、end promiseが作成される', async () => {
      const options: PlaybackOptions = { waitForEnd: true }

      const { promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(promises.end).toBeDefined()
    })

    it('waitForEnd=false の場合、end promiseが作成されない', async () => {
      const options: PlaybackOptions = { waitForEnd: false }

      const { promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(promises.end).toBeUndefined()
    })
  })

  describe('オプションの組み合わせテスト', () => {
    it('waitForStart=true かつ waitForEnd=true の場合、両方のPromiseが作成される', async () => {
      const options: PlaybackOptions = {
        waitForStart: true,
        waitForEnd: true,
      }

      const { promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(promises.start).toBeDefined()
      expect(promises.end).toBeDefined()
    })

    it('immediate=false かつ waitForStart=true の場合、オプションが正しく設定される', async () => {
      const options: PlaybackOptions = {
        immediate: false,
        waitForStart: true,
      }

      const { item, promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(item.options?.immediate).toBe(false)
      expect(promises.start).toBeDefined()
    })
  })

  describe('エラーハンドリング', () => {
    it('音声生成エラー時に適切にPromiseが拒否される', async () => {
      // console.errorをモックして抑制
      const originalConsoleError = console.error
      console.error = vi.fn()

      // APIエラーを発生させる
      ;(mockApi.generateQuery as any).mockRejectedValue(new Error('API Error'))

      const options: PlaybackOptions = {
        waitForStart: true,
        waitForEnd: true,
      }

      await expect(queueManager.enqueueTextWithOptions('テスト音声', 1, options)).rejects.toThrow('API Error')

      // console.errorを元に戻す
      console.error = originalConsoleError
    })
  })

  describe('基本的な機能確認', () => {
    it('オプションなしの場合、デフォルト値が適用される', async () => {
      const { item, promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1)

      expect(item.options).toEqual({})
      expect(promises.start).toBeUndefined()
      expect(promises.end).toBeUndefined()
    })

    it('複数のオプションを同時に指定できる', async () => {
      const options: PlaybackOptions = {
        immediate: false,
        waitForStart: true,
        waitForEnd: true,
      }

      const { item, promises } = await queueManager.enqueueTextWithOptions('テスト音声', 1, options)

      expect(item.options?.immediate).toBe(false)
      expect(promises.start).toBeDefined()
      expect(promises.end).toBeDefined()
    })
  })
})
