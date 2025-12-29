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
const mockStartPlayback = vi.fn()

vi.mock('../queue/queue-service', () => ({
  QueueService: vi.fn().mockImplementation(() => ({
    enqueueQuery: mockEnqueueQuery,
    enqueueText: vi.fn(),
    startPlayback: mockStartPlayback,
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

describe('Immediate Playback', () => {
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

  it('should play immediately when immediate option is true', async () => {
    const options: SpeakOptions = { immediate: true }

    await client.speak('テスト音声', options)

    // immediate=true の場合、clearQueue が呼ばれる
    expect(mockClearQueue).toHaveBeenCalledTimes(1)
    // enqueueQuery も呼ばれる
    expect(mockEnqueueQuery).toHaveBeenCalled()
  })

  it('should handle multiple immediate playbacks concurrently', async () => {
    const options: SpeakOptions = { immediate: true }

    // 複数の即時再生を同時に開始
    await Promise.all([
      client.speak('即時再生1', options),
      client.speak('即時再生2', options),
      client.speak('即時再生3', options),
    ])

    // 各speakでclearQueueが呼ばれる
    expect(mockClearQueue).toHaveBeenCalledTimes(3)
    // enqueueQueryが各再生で呼ばれる
    expect(mockEnqueueQuery).toHaveBeenCalledTimes(3)
  })

  it('should not affect normal queue when immediate playback is used', async () => {
    // まず通常のキューに音声を追加
    await client.speak('通常1', { immediate: false })
    await client.speak('通常2', { immediate: false })

    // immediate=false ではclearQueueは呼ばれない
    expect(mockClearQueue).not.toHaveBeenCalled()

    // 即時再生を追加
    await client.speak('即時', { immediate: true })

    // 即時再生でclearQueueが呼ばれる
    expect(mockClearQueue).toHaveBeenCalledTimes(1)
  })

  it('should work with waitForStart option', async () => {
    let startResolved = false

    mockEnqueueQuery.mockResolvedValueOnce({
      item: { id: 'test1' },
      promises: {
        start: new Promise<void>((resolve) => {
          setTimeout(() => {
            startResolved = true
            resolve()
          }, 50)
        }),
      },
    })

    const options: SpeakOptions = {
      immediate: true,
      waitForStart: true,
    }

    await client.speak('テスト音声', options)

    // waitForStart=true なので start Promise が解決されている
    expect(startResolved).toBe(true)
  })

  it('should work with both waitForStart and waitForEnd options', async () => {
    let startResolved = false
    let endResolved = false

    mockEnqueueQuery.mockResolvedValueOnce({
      item: { id: 'test1' },
      promises: {
        start: new Promise<void>((resolve) => {
          setTimeout(() => {
            startResolved = true
            resolve()
          }, 30)
        }),
        end: new Promise<void>((resolve) => {
          setTimeout(() => {
            endResolved = true
            resolve()
          }, 60)
        }),
      },
    })

    const options: SpeakOptions = {
      immediate: true,
      waitForStart: true,
      waitForEnd: true,
    }

    await client.speak('テスト音声', options)

    // 両方の Promise が解決されている
    expect(startResolved).toBe(true)
    expect(endResolved).toBe(true)
  })
})
