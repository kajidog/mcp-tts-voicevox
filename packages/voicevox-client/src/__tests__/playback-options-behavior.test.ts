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

describe('Playback Options Behavior Tests', () => {
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

  describe('immediate オプション - キューをクリアする', () => {
    it('immediate=true の場合、clearQueue が呼ばれる', async () => {
      const options: SpeakOptions = { immediate: true }

      await client.speak('テスト音声', options)

      expect(mockClearQueue).toHaveBeenCalledTimes(1)
    })

    it('immediate=false の場合、clearQueue は呼ばれない', async () => {
      const options: SpeakOptions = { immediate: false }

      await client.speak('テスト音声', options)

      expect(mockClearQueue).not.toHaveBeenCalled()
    })

    it('immediate 未指定でデフォルト true の場合、clearQueue が呼ばれる', async () => {
      // デフォルトは immediate: true
      await client.speak('テスト音声', {})

      expect(mockClearQueue).toHaveBeenCalledTimes(1)
    })
  })

  describe('waitForStart オプション - 最初のセグメントの開始のみ待つ', () => {
    it('waitForStart=true の場合、最初のセグメントにのみ waitForStart=true が渡される', async () => {
      const options: SpeakOptions = { waitForStart: true, immediate: false }

      mockEnqueueQuery.mockResolvedValue({
        item: { id: 'test' },
        promises: { start: Promise.resolve() },
      })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
        { text: '第3セグメント', speaker: 3 },
      ]

      await client.speak(segments, options)

      // 第1セグメント: waitForStart=true
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForStart: true }),
        '第1セグメント'
      )

      // 第2セグメント: waitForStart=false
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForStart: false }),
        '第2セグメント'
      )

      // 第3セグメント: waitForStart=false
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        3,
        expect.any(Object),
        3,
        expect.objectContaining({ waitForStart: false }),
        '第3セグメント'
      )
    })

    it('waitForStart=true で最初のセグメントの start Promise のみ待つ', async () => {
      const options: SpeakOptions = { waitForStart: true, immediate: false }

      let firstStartResolved = false
      let secondStartResolved = false

      mockEnqueueQuery
        .mockResolvedValueOnce({
          item: { id: 'test1' },
          promises: {
            start: new Promise<void>((resolve) => {
              setTimeout(() => {
                firstStartResolved = true
                resolve()
              }, 50)
            }),
          },
        })
        .mockResolvedValueOnce({
          item: { id: 'test2' },
          promises: {
            start: new Promise<void>((resolve) => {
              setTimeout(() => {
                secondStartResolved = true
                resolve()
              }, 200)
            }),
          },
        })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // 最初のセグメントの start は解決されている
      expect(firstStartResolved).toBe(true)
      // 2番目のセグメントの start は待っていない
      expect(secondStartResolved).toBe(false)
    })
  })

  describe('waitForEnd オプション - 最後のセグメントの終了のみ待つ', () => {
    it('waitForEnd=true の場合、最後のセグメントにのみ waitForEnd=true が渡される', async () => {
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

      // 第1セグメント: waitForEnd=true (最初のセグメントの promises から lastEndPromise 候補として保持)
      // ただし、実際に待つのは最後のセグメントの end のみ
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForEnd: true }),
        '第1セグメント'
      )

      // 第2セグメント: waitForEnd=false (最後ではないので)
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: false }),
        '第2セグメント'
      )

      // 第3セグメント: waitForEnd=true (最後のセグメント)
      expect(mockEnqueueQuery).toHaveBeenNthCalledWith(
        3,
        expect.any(Object),
        3,
        expect.objectContaining({ waitForEnd: true }),
        '第3セグメント'
      )
    })

    it('waitForEnd=true で最後のセグメントの end Promise のみ待つ', async () => {
      const options: SpeakOptions = { waitForEnd: true, immediate: false }

      let firstEndResolved = false
      let lastEndResolved = false

      mockEnqueueQuery
        .mockResolvedValueOnce({
          item: { id: 'test1' },
          promises: {
            end: new Promise<void>((resolve) => {
              setTimeout(() => {
                firstEndResolved = true
                resolve()
              }, 200)
            }),
          },
        })
        .mockResolvedValueOnce({
          item: { id: 'test2' },
          promises: {
            end: new Promise<void>((resolve) => {
              setTimeout(() => {
                lastEndResolved = true
                resolve()
              }, 50)
            }),
          },
        })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // 最後のセグメントの end は解決されている
      expect(lastEndResolved).toBe(true)
      // 最初のセグメントの end はまだ解決されていない（待っていない）
      expect(firstEndResolved).toBe(false)
    })

    it('単一セグメントの場合、そのセグメントの end を待つ', async () => {
      const options: SpeakOptions = { waitForEnd: true, immediate: false }

      let endResolved = false

      mockEnqueueQuery.mockResolvedValueOnce({
        item: { id: 'test1' },
        promises: {
          end: new Promise<void>((resolve) => {
            setTimeout(() => {
              endResolved = true
              resolve()
            }, 50)
          }),
        },
      })

      await client.speak('単一テキスト', options)

      expect(endResolved).toBe(true)
    })
  })

  describe('複合オプションのテスト', () => {
    it('immediate=true, waitForStart=true, waitForEnd=true の組み合わせ', async () => {
      const options: SpeakOptions = {
        immediate: true,
        waitForStart: true,
        waitForEnd: true,
      }

      let firstStartResolved = false
      let lastEndResolved = false

      mockEnqueueQuery
        .mockResolvedValueOnce({
          item: { id: 'test1' },
          promises: {
            start: new Promise<void>((resolve) => {
              setTimeout(() => {
                firstStartResolved = true
                resolve()
              }, 30)
            }),
            end: new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 200)
            }),
          },
        })
        .mockResolvedValueOnce({
          item: { id: 'test2' },
          promises: {
            start: new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 200)
            }),
            end: new Promise<void>((resolve) => {
              setTimeout(() => {
                lastEndResolved = true
                resolve()
              }, 50)
            }),
          },
        })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.speak(segments, options)

      // clearQueue が呼ばれている
      expect(mockClearQueue).toHaveBeenCalledTimes(1)
      // 最初のセグメントの start が解決されている
      expect(firstStartResolved).toBe(true)
      // 最後のセグメントの end が解決されている
      expect(lastEndResolved).toBe(true)
    })
  })

  describe('enqueueAudioGeneration でも同様の挙動', () => {
    it('immediate=true の場合、clearQueue が呼ばれる', async () => {
      const options: SpeakOptions = { immediate: true }

      await client.enqueueAudioGeneration('テスト音声', options)

      expect(mockClearQueue).toHaveBeenCalledTimes(1)
    })

    it('waitForStart=true で最初のセグメントの start のみ待つ', async () => {
      const options: SpeakOptions = { waitForStart: true, immediate: false }

      let firstStartResolved = false

      mockEnqueueQuery
        .mockResolvedValueOnce({
          item: { id: 'test1' },
          promises: {
            start: new Promise<void>((resolve) => {
              setTimeout(() => {
                firstStartResolved = true
                resolve()
              }, 50)
            }),
          },
        })
        .mockResolvedValueOnce({
          item: { id: 'test2' },
          promises: {
            start: new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 200)
            }),
          },
        })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.enqueueAudioGeneration(segments, options)

      expect(firstStartResolved).toBe(true)
    })

    it('waitForEnd=true で最後のセグメントの end のみ待つ', async () => {
      const options: SpeakOptions = { waitForEnd: true, immediate: false }

      let lastEndResolved = false

      mockEnqueueQuery
        .mockResolvedValueOnce({
          item: { id: 'test1' },
          promises: {
            end: new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 200)
            }),
          },
        })
        .mockResolvedValueOnce({
          item: { id: 'test2' },
          promises: {
            end: new Promise<void>((resolve) => {
              setTimeout(() => {
                lastEndResolved = true
                resolve()
              }, 50)
            }),
          },
        })

      const segments = [
        { text: '第1セグメント', speaker: 1 },
        { text: '第2セグメント', speaker: 2 },
      ]

      await client.enqueueAudioGeneration(segments, options)

      expect(lastEndResolved).toBe(true)
    })
  })
})
