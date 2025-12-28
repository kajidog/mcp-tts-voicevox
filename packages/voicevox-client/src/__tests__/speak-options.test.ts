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
vi.mock('../queue/queue-service', () => ({
  QueueService: vi.fn().mockImplementation(() => ({
    enqueueQuery: mockEnqueueQuery,
    enqueueText: vi.fn(),
    startPlayback: vi.fn(),
    clearQueue: vi.fn(),
    cleanup: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getQueue: vi.fn().mockReturnValue([]),
    getFileManager: vi.fn().mockReturnValue({
      saveTempAudioFile: vi.fn(),
      saveAudioFile: vi.fn(),
    }),
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
    it('immediate=true を指定した場合、第1セグメントに immediate=true が渡される', async () => {
      const options: SpeakOptions = { immediate: true }

      await client.speak('テスト音声', options)

      expect(mockEnqueueQuery).toHaveBeenCalledWith(expect.any(Object), 1, expect.objectContaining({ immediate: true }))
    })

    it('immediate=false を指定した場合、第1セグメントに immediate=false が渡される', async () => {
      const options: SpeakOptions = { immediate: false }

      await client.speak('テスト音声', options)

      expect(mockEnqueueQuery).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: false })
      )
    })

    it('複数セグメントの場合、第2セグメント以降は immediate=false になる', async () => {
      const options: SpeakOptions = { immediate: true }

      // SpeechSegment配列として渡す
      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 第1セグメント
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: true })
      )

      // 第2セグメント（immediate=false になる）
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ immediate: false })
      )
    })
  })

  describe('waitForEnd オプションの動作確認', () => {
    it('waitForEnd=true の場合、すべてのセグメントの Promise が作成される', async () => {
      const options: SpeakOptions = { waitForEnd: true }

      // Promise を作成するモック
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

      // 第1セグメント
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForEnd: true })
      )

      // 第2セグメント
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: true })
      )
    })

    it('waitForEnd=false の場合、第2セグメント以降は非同期処理される', async () => {
      const options: SpeakOptions = { waitForEnd: false }

      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: {},
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 第1セグメント
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForEnd: false })
      )

      // 第2セグメント（非同期なので実行順序は保証されない）
      expect(mockEnqueueQuery).toHaveBeenCalledWith(
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: false, immediate: false })
      )
    })
  })

  describe('waitForStart オプションの動作確認', () => {
    it('waitForStart=true の場合、すべてのセグメントに適用される', async () => {
      const options: SpeakOptions = { waitForStart: true }

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

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockEnqueueQuery).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ waitForStart: true })
      )

      expect(mockEnqueueQuery).toHaveBeenCalledWith(
        expect.any(Object),
        2,
        expect.objectContaining({ waitForStart: true })
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

      // 第1セグメント
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({
          immediate: true,
          waitForStart: true,
          waitForEnd: true,
        })
      )

      // 第2セグメント（immediate は false になる）
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({
          immediate: false,
          waitForStart: true,
          waitForEnd: true,
        })
      )
    })
  })

  describe('エラー処理の確認', () => {
    it('第2セグメント以降でエラーが発生しても第1セグメントは影響を受けない', async () => {
      // console.errorをモックして抑制
      const originalConsoleError = console.error
      console.error = vi.fn()

      const options: SpeakOptions = { waitForEnd: false }

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

      // エラーが発生してもメソッド全体は成功する（非同期処理のため）
      await expect(client.speak(segments, options)).resolves.toBeDefined()

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockEnqueueQuery).toHaveBeenCalledTimes(2)

      // console.errorを元に戻す
      console.error = originalConsoleError
    })
  })
})
