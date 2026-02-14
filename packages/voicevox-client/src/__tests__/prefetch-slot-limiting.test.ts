import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueItemStatus } from '../queue/types'

// --- Helpers ---

function createDeferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 10))

// --- Mocks ---

const mockGenerateQuery = vi.fn()
const mockSynthesize = vi.fn()

vi.mock('../api', () => ({
  VoicevoxApi: vi.fn().mockImplementation(() => ({
    generateQuery: mockGenerateQuery,
    synthesize: mockSynthesize,
  })),
}))

vi.mock('../queue/file-manager', () => ({
  AudioFileManager: vi.fn().mockImplementation(() => ({
    saveTempAudioFile: vi.fn().mockResolvedValue('/tmp/mock.wav'),
    deleteTempFile: vi.fn().mockResolvedValue(undefined),
    releaseAllBlobUrls: vi.fn(),
  })),
}))

let playbackCallbacks: {
  onComplete?: (id: string) => void
  onError?: (id: string, err: Error) => void
} = {}

vi.mock('../playback/index', () => ({
  PlaybackService: vi.fn().mockImplementation((options: any) => {
    playbackCallbacks = options?.callbacks || {}
    return {
      play: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
      stop: vi.fn(),
      stopAll: vi.fn(),
      stopAllAndWait: vi.fn().mockResolvedValue(undefined),
      isStreamingEnabled: vi.fn().mockReturnValue(false),
    }
  }),
}))

// --- Tests ---

describe('QueueService prefetch slot limiting', () => {
  let queueService: any
  let synthDeferreds: Array<ReturnType<typeof createDeferred<ArrayBuffer>>>

  beforeEach(async () => {
    vi.clearAllMocks()
    synthDeferreds = []
    playbackCallbacks = {}

    mockGenerateQuery.mockResolvedValue({
      accent_phrases: [],
      speedScale: 1.0,
      prePhonemeLength: 0,
      postPhonemeLength: 0,
    })

    mockSynthesize.mockImplementation(() => {
      const d = createDeferred<ArrayBuffer>()
      synthDeferreds.push(d)
      return d.promise
    })

    const { VoicevoxApi } = await import('../api')
    const { QueueService } = await import('../queue/queue-service')
    const api = new VoicevoxApi('http://localhost:50021')
    queueService = new QueueService(api, { prefetchSize: 2 })
  })

  it('should not exceed prefetchSize concurrent generations', async () => {
    await queueService.enqueueText('text-1', 1, { immediate: false })
    await queueService.enqueueText('text-2', 1, { immediate: false })
    await queueService.enqueueText('text-3', 1, { immediate: false })
    await queueService.enqueueText('text-4', 1, { immediate: false })
    await flush()

    // prefetchSize=2: only 2 synthesize calls should have been made
    expect(synthDeferreds).toHaveLength(2)
  })

  it('should count READY items toward prefetch slots', async () => {
    // Enqueue 5 items
    await queueService.enqueueText('text-1', 1, { immediate: false })
    await queueService.enqueueText('text-2', 1, { immediate: false })
    await queueService.enqueueText('text-3', 1, { immediate: false })
    await queueService.enqueueText('text-4', 1, { immediate: false })
    await queueService.enqueueText('text-5', 1, { immediate: false })
    await flush()
    expect(synthDeferreds).toHaveLength(2)

    // Complete item 1 → READY → auto-PLAYING → triggerPrefetch starts item 3
    synthDeferreds[0].resolve(new ArrayBuffer(100))
    await flush()
    expect(synthDeferreds).toHaveLength(3)

    // Complete item 2 → READY (stays READY; item 1 is PLAYING)
    // triggerPrefetch: READY=1, GENERATING=1 → slots=0 → nothing
    synthDeferreds[1].resolve(new ArrayBuffer(100))
    await flush()
    expect(synthDeferreds).toHaveLength(3)

    // Complete item 3 → READY
    // triggerPrefetch: READY=2, GENERATING=0 → slots=0 → nothing
    synthDeferreds[2].resolve(new ArrayBuffer(100))
    await flush()
    expect(synthDeferreds).toHaveLength(3) // items 4,5 still PENDING

    // Verify queue state
    const queue = queueService.getQueue()
    const readyItems = queue.filter((i: any) => i.status === QueueItemStatus.READY)
    const pendingItems = queue.filter((i: any) => i.status === QueueItemStatus.PENDING)
    expect(readyItems).toHaveLength(2)
    expect(pendingItems).toHaveLength(2)
  })

  it('should start new generation when playback completes and frees a slot', async () => {
    // Enqueue 5 items
    await queueService.enqueueText('text-1', 1, { immediate: false })
    await queueService.enqueueText('text-2', 1, { immediate: false })
    await queueService.enqueueText('text-3', 1, { immediate: false })
    await queueService.enqueueText('text-4', 1, { immediate: false })
    await queueService.enqueueText('text-5', 1, { immediate: false })
    await flush()

    // Complete first 3 generations (item 1 auto-plays, items 2,3 stay READY)
    synthDeferreds[0].resolve(new ArrayBuffer(100))
    await flush()
    synthDeferreds[1].resolve(new ArrayBuffer(100))
    await flush()
    synthDeferreds[2].resolve(new ArrayBuffer(100))
    await flush()
    expect(synthDeferreds).toHaveLength(3) // items 4,5 still PENDING

    // Simulate item 1 playback completion
    // → item 2 starts PLAYING → handlePlaybackStart → triggerPrefetch
    // → READY=1 (item 3), GENERATING=0 → slots=1 → starts item 4
    const playingItem = queueService.getQueue().find((i: any) => i.status === QueueItemStatus.PLAYING)
    expect(playingItem).toBeDefined()
    playbackCallbacks.onComplete?.(playingItem!.id)
    await flush()

    expect(synthDeferreds).toHaveLength(4) // item 4 now generating
  })
})
