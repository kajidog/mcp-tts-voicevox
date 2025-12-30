import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SpeakOptions, VoicevoxClient } from '../client'
import type { VoicevoxConfig } from '../types'

// APIのモック
vi.mock('../api', () => ({
  VoicevoxApi: vi.fn().mockImplementation(() => ({
    generateQuery: vi.fn().mockResolvedValue({
      accent_phrases: [],
      speedScale: 1.0,
      pitchScale: 0.0,
      intonationScale: 1.0,
      volumeScale: 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      outputSamplingRate: 24000,
      outputStereo: false,
    }),
    synthesize: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
  })),
}))

// QueueServiceのモック
const mockEnqueueQuery = vi.fn()
const mockClearQueue = vi.fn()

vi.mock('../queue/queue-service', () => ({
  QueueService: vi.fn().mockImplementation(() => ({
    enqueueQuery: mockEnqueueQuery,
    enqueueText: vi.fn(),
    startPlayback: vi.fn(),
    clearQueue: mockClearQueue,
    cleanup: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getQueue: vi.fn().mockReturnValue([]),
    getFileManager: vi.fn().mockReturnValue({
      saveTempAudioFile: vi.fn(),
      saveAudioFile: vi.fn(),
    }),
    isStreamingEnabled: vi.fn().mockReturnValue(true),
  })),
}))

describe('VoicevoxClient - speak メソッドのオプションテスト', () => {
  const originalEnv = process.env
  let client: VoicevoxClient

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }

    const config: VoicevoxConfig = {
      url: 'http://localhost:50021',
      defaultSpeaker: 1,
    }

    client = new VoicevoxClient(config)

    // enqueueQuery のモックを設定
    mockEnqueueQuery.mockResolvedValue({
      item: { id: 'test' },
      promises: {},
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('immediate オプションの動作確認', () => {
    it('immediate=true を指定した場合、clearQueue が呼ばれ、enqueueQuery には immediate=false が渡される', async () => {
      const options: SpeakOptions = { immediate: true }

      await client.speak('テスト音声', options)

      // clearQueue が呼ばれている
      expect(mockClearQueue).toHaveBeenCalledTimes(1)
      // enqueueQuery には immediate=false が渡される（キュークリア後は通常処理）
      expect(mockEnqueueQuery).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: false })
      )
    })

    it('immediate=false を指定した場合、clearQueue は呼ばれず、enqueueQuery に immediate=false が渡される', async () => {
      const options: SpeakOptions = { immediate: false }

      await client.speak('テスト音声', options)

      expect(mockClearQueue).not.toHaveBeenCalled()
      expect(mockEnqueueQuery).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: false })
      )
    })

    it('複数セグメントの場合、すべてのセグメントで immediate=false になる', async () => {
      const options: SpeakOptions = { immediate: true }

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // clearQueue が呼ばれている
      expect(mockClearQueue).toHaveBeenCalledTimes(1)

      // 第1セグメント: immediate=false
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: false })
      )

      // 第2セグメント: immediate=false
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ immediate: false })
      )
    })
  })

  describe('waitForEnd オプションの動作確認', () => {
    it('waitForEnd=true の場合、最後のセグメントにのみ waitForEnd=true が渡される', async () => {
      const options: SpeakOptions = { waitForEnd: true, immediate: false }

      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {
          end: Promise.resolve(),
        },
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // 第1セグメント: waitForEnd=true (最初のセグメントなので lastEndPromise 候補として保持)
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForEnd: true })
      )

      // 第2セグメント: waitForEnd=true (最後のセグメント)
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: true })
      )
    })

    it('3つ以上のセグメントの場合、中間セグメントは waitForEnd=false になる', async () => {
      const options: SpeakOptions = { waitForEnd: true, immediate: false }

      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: { end: Promise.resolve() },
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
        { text: '第3セグメント', speaker: 3 },
      ]

      await client.speak(segments, options)

      // 第2セグメント（中間）: waitForEnd=false
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: false })
      )

      // 第3セグメント（最後）: waitForEnd=true
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        3,
        expect.any(Object),
        3,
        expect.objectContaining({ waitForEnd: true })
      )
    })
  })

  describe('waitForStart オプションの動作確認', () => {
    it('waitForStart=true の場合、最初のセグメントにのみ waitForStart=true が渡される', async () => {
      const options: SpeakOptions = { waitForStart: true, immediate: false }

      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {
          start: Promise.resolve(),
        },
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // 第1セグメント: waitForStart=true
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForStart: true })
      )

      // 第2セグメント: waitForStart=false
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForStart: false })
      )
    })
  })

  describe('複合オプションのテスト', () => {
    it('immediate=true, waitForStart=true, waitForEnd=true の組み合わせ', async () => {
      const options: SpeakOptions = {
        immediate: true,
        waitForStart: true,
        waitForEnd: true,
      }

      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {
          start: Promise.resolve(),
          end: Promise.resolve(),
        },
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // clearQueue が呼ばれている
      expect(mockClearQueue).toHaveBeenCalledTimes(1)

      // 第1セグメント: immediate=false, waitForStart=true, waitForEnd=true
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({
          immediate: false,
          waitForStart: true,
          waitForEnd: true,
        })
      )

      // 第2セグメント: immediate=false, waitForStart=false, waitForEnd=true
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({
          immediate: false,
          waitForStart: false,
          waitForEnd: true,
        })
      )
    })
  })

  describe('エラー処理の確認', () => {
    it('第2セグメント以降でエラーが発生してもメソッドはエラー結果を返す', async () => {
      const options: SpeakOptions = { waitForEnd: false, immediate: false }

      // 第1セグメントは成功、第2セグメントでエラー
      mockEnqueueQuery
        .mockResolvedValueOnce({
          item: { id: 'test1' },
          promises: {},
        })
        .mockRejectedValueOnce(new Error('第2セグメントエラー'))

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      const result = await client.speak(segments, options)

      // エラー結果が返される
      expect(result.status).toBe('error')
      expect(result.errorMessage).toContain('第2セグメントエラー')
      expect(mockEnqueueQuery).toHaveBeenCalledTimes(2)
    })
  })

  describe('SpeakResult の戻り値確認', () => {
    it('正常終了時は queued ステータスと streaming モードを返す', async () => {
      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {},
      })

      const result = await client.speak('テスト音声')

      expect(result.status).toBe('queued')
      expect(result.mode).toBe('streaming')
      expect(result.textPreview).toBe('テスト音声')
      expect(result.segmentCount).toBe(1)
    })

    it('waitForEnd=true の場合は played ステータスを返す', async () => {
      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: { end: Promise.resolve() },
      })

      const result = await client.speak('テスト音声', { waitForEnd: true })

      expect(result.status).toBe('played')
    })

    it('長いテキストはプレビューが切り詰められる', async () => {
      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {},
      })

      const longText = 'これは非常に長いテキストで、30文字を超えています。プレビューは切り詰められるべきです。'
      const result = await client.speak(longText)

      expect(result.textPreview.length).toBeLessThanOrEqual(33) // 30 + "..."
      expect(result.textPreview).toContain('...')
    })

    it('複数セグメントの場合は segmentCount が正しく設定される', async () => {
      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {},
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
        { text: '第3セグメント', speaker: 3 },
      ]

      const result = await client.speak(segments, { immediate: false })

      expect(result.segmentCount).toBe(3)
    })
  })
})
