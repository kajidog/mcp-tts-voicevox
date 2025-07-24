/**
 * Effect-based VoicevoxQueueManager
 * Demonstrates improved patterns with Effect.ts for:
 * - Structured error handling
 * - Resource management with automatic cleanup
 * - Dependency injection through Context
 * - Complex async coordination
 */

import { Context, Duration, Effect, Layer, Queue, Ref } from 'effect'
import { v4 as uuidv4 } from 'uuid'
import { QueueEventType, QueueItemStatus } from '../queue/types'
import type { AudioQuery, PlaybackOptions } from '../types'
import {
  AudioGeneratorContext,
  type AudioGeneratorService,
  AudioPlayerContext,
  type AudioPlayerService,
  EventManagerContext,
  type EventManagerService,
  FileManagerContext,
  type FileManagerService,
  type QueueItemData,
} from './context'
import {
  type FileOperationError,
  type PlaybackError,
  type QueueOperationError,
  makeFileOperationError,
  makePlaybackError,
  makeQueueOperationError,
  safeAsync,
} from './errors'
import { createFlag, logTimed, removeById, updateById, waitForCondition } from './utils'

/**
 * Queue manager state
 */
interface QueueManagerState {
  readonly queue: readonly QueueItemData[]
  readonly isPlaying: boolean
  readonly isPaused: boolean
  readonly currentPlayingItem: QueueItemData | null
  readonly prefetchSize: number
}

/**
 * Effect-based Queue Manager service
 */
export interface EffectQueueManagerService {
  /**
   * Add text to queue with full options support
   */
  readonly enqueueTextWithOptions: (
    text: string,
    speaker: number,
    options?: PlaybackOptions
  ) => Effect.Effect<
    {
      item: QueueItemData
      promises: { start?: Promise<void>; end?: Promise<void> }
    },
    QueueOperationError | PlaybackError | FileOperationError
  >

  /**
   * Add audio query to queue with options
   */
  readonly enqueueQueryWithOptions: (
    query: AudioQuery,
    speaker: number,
    options?: PlaybackOptions
  ) => Effect.Effect<
    {
      item: QueueItemData
      promises: { start?: Promise<void>; end?: Promise<void> }
    },
    QueueOperationError | PlaybackError | FileOperationError
  >

  /**
   * Remove item from queue
   */
  readonly removeItem: (itemId: string) => Effect.Effect<boolean, FileOperationError>

  /**
   * Clear entire queue
   */
  readonly clearQueue: () => Effect.Effect<void, FileOperationError>

  /**
   * Playback control methods
   */
  readonly startPlayback: () => Effect.Effect<void, never>
  readonly pausePlayback: () => Effect.Effect<void, never>
  readonly resumePlayback: () => Effect.Effect<void, never>
  readonly playNext: () => Effect.Effect<void, PlaybackError | FileOperationError>

  /**
   * Queue inspection
   */
  readonly getQueue: () => Effect.Effect<readonly QueueItemData[], never>
  readonly getItemStatus: (itemId: string) => Effect.Effect<string | null, never>

  /**
   * Resource cleanup
   */
  readonly cleanup: () => Effect.Effect<void, never>
}

/**
 * Context for the Effect-based queue manager
 */
export const EffectQueueManagerContext = Context.GenericTag<EffectQueueManagerService>('@voicevox/EffectQueueManager')

/**
 * Implementation of the Effect-based queue manager
 */
export const makeEffectQueueManager = (
  prefetchSize = 2
): Effect.Effect<
  EffectQueueManagerService,
  never,
  FileManagerService | EventManagerService | AudioGeneratorService | AudioPlayerService
> =>
  Effect.gen(function* () {
    // Get services from context
    const fileManager = yield* FileManagerContext
    const eventManager = yield* EventManagerContext
    const audioGenerator = yield* AudioGeneratorContext
    const audioPlayer = yield* AudioPlayerContext

    // Create internal state using Ref for thread safety
    const queueState = yield* Ref.make<QueueManagerState>({
      queue: [],
      isPlaying: false,
      isPaused: false,
      currentPlayingItem: null,
      prefetchSize,
    })

    // Create processing queue for async coordination
    const processingQueue = yield* Queue.unbounded<QueueItemData>()

    // Create flags and counters for state management
    const isProcessing = yield* createFlag(false)

    /**
     * Update item status with proper error handling and event emission
     */
    const updateItemStatus = (item: QueueItemData, status: QueueItemStatus): Effect.Effect<QueueItemData, never> =>
      Effect.gen(function* () {
        const updatedItem = { ...item, status }

        // Update item in queue
        yield* Ref.update(queueState, (state) => ({
          ...state,
          queue: updateById(state.queue, item.id, () => updatedItem),
        }))

        // Emit status change event
        yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.ITEM_STATUS_CHANGED, updatedItem))

        // Trigger additional processing based on status
        if (status === QueueItemStatus.READY) {
          yield* Queue.offer(processingQueue, updatedItem)
        }

        return updatedItem
      })

    /**
     * Create queue item with promise resolvers for wait options
     */
    const createQueueItem = (
      text: string,
      speaker: number,
      options?: PlaybackOptions,
      query?: AudioQuery
    ): Effect.Effect<
      {
        item: QueueItemData
        promises: { start?: Promise<void>; end?: Promise<void> }
      },
      never
    > =>
      Effect.gen(function* () {
        const id = uuidv4()
        const playbackPromiseResolvers: any = {}
        const promises: { start?: Promise<void>; end?: Promise<void> } = {}

        // Create promises based on wait options
        if (options?.waitForStart) {
          promises.start = new Promise<void>((resolve) => {
            playbackPromiseResolvers.startResolve = resolve
          })
        }
        if (options?.waitForEnd) {
          promises.end = new Promise<void>((resolve) => {
            playbackPromiseResolvers.endResolve = resolve
          })
        }

        const item: QueueItemData = {
          id,
          text,
          speaker,
          status: QueueItemStatus.PENDING,
          createdAt: new Date(),
          query,
          options: options || {},
          playbackPromiseResolvers,
        }

        return { item, promises }
      })

    /**
     * Generate audio for queue item with proper error handling
     */
    const generateAudioForItem = (item: QueueItemData): Effect.Effect<QueueItemData, QueueOperationError> =>
      Effect.gen(function* () {
        yield* updateItemStatus(item, QueueItemStatus.GENERATING)

        // Generate query if not provided
        let query = item.query
        if (!query && item.text) {
          query = yield* safeAsync(
            () => audioGenerator.generateQuery(item.text, item.speaker),
            (error) => makeQueueOperationError('Failed to generate audio query', 'enqueue', item.id, error)
          )
        }

        // Generate audio from query
        const updatedItem = { ...item, query }
        yield* safeAsync(
          () =>
            audioGenerator.generateAudioFromQuery(updatedItem, (item, status) =>
              Effect.runSync(updateItemStatus(item, status as QueueItemStatus))
            ),
          (error) => makeQueueOperationError('Failed to generate audio from query', 'enqueue', item.id, error)
        )

        return updatedItem
      })

    /**
     * Play audio immediately (bypass queue)
     */
    const playImmediately = (item: QueueItemData): Effect.Effect<void, PlaybackError | FileOperationError> =>
      Effect.gen(function* () {
        // Wait for audio generation to complete
        yield* waitForCondition(
          Effect.gen(function* () {
            const currentState = yield* Ref.get(queueState)
            const currentItem = currentState.queue.find((i) => i.id === item.id)
            return currentItem?.status === QueueItemStatus.READY && !!currentItem.tempFile
          }),
          Duration.seconds(30), // 30 second timeout
          Duration.millis(50) // Check every 50ms
        ).pipe(
          Effect.catchAll((error) =>
            Effect.fail(makePlaybackError('Timeout waiting for audio generation', undefined, error))
          )
        )

        // Get updated item from state
        const currentState = yield* Ref.get(queueState)
        const readyItem = currentState.queue.find((i) => i.id === item.id)

        if (!readyItem || !readyItem.tempFile) {
          return yield* Effect.fail(makePlaybackError('No audio file available for immediate playback'))
        }

        // Notify playback start
        const startResolve = readyItem.playbackPromiseResolvers?.startResolve
        if (startResolve) {
          yield* Effect.sync(() => startResolve())
        }

        // Play audio
        const tempFile = readyItem.tempFile!
        yield* logTimed(
          'immediate-playback',
          safeAsync(
            () => audioPlayer.playAudio(tempFile),
            (error) => makePlaybackError('Failed to play audio immediately', tempFile, error)
          )
        )

        // Clean up temp file
        yield* safeAsync(
          () => fileManager.deleteTempFile(tempFile),
          (error) => makeFileOperationError('Failed to cleanup temp file', 'delete', tempFile, error)
        )

        // Update status and notify completion
        yield* updateItemStatus(readyItem, QueueItemStatus.DONE)
        yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.ITEM_COMPLETED, readyItem))

        // Notify playback end
        const endResolve = readyItem.playbackPromiseResolvers?.endResolve
        if (endResolve) {
          yield* Effect.sync(() => endResolve())
        }

        // Remove from queue
        yield* Ref.update(queueState, (state) => ({
          ...state,
          queue: removeById(state.queue, item.id),
        }))
      })

    /**
     * Process queue items sequentially
     */
    const processQueueItems = (): Effect.Effect<void, PlaybackError | FileOperationError> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(queueState)

        // Don't process if paused or already processing
        if (!state.isPlaying || state.isPaused) return

        const isCurrentlyProcessing = yield* isProcessing.get
        if (isCurrentlyProcessing) return

        yield* isProcessing.set

        try {
          // Find next ready item
          const nextItem = state.queue.find((item) => item.status === QueueItemStatus.READY)
          if (!nextItem?.tempFile) return

          // Update current playing item
          yield* Ref.update(queueState, (s) => ({
            ...s,
            currentPlayingItem: nextItem,
          }))

          yield* updateItemStatus(nextItem, QueueItemStatus.PLAYING)

          // Notify playback start
          if (nextItem.playbackPromiseResolvers?.startResolve) {
            yield* Effect.sync(() => nextItem.playbackPromiseResolvers!.startResolve!)
          }

          // Play audio with proper resource management
          yield* logTimed(
            'queue-playback',
            safeAsync(
              () => audioPlayer.playAudio(nextItem.tempFile!),
              (error) => makePlaybackError('Failed to play queued audio', nextItem.tempFile, error)
            )
          )

          // Mark as completed
          yield* updateItemStatus(nextItem, QueueItemStatus.DONE)
          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.ITEM_COMPLETED, nextItem))

          // Notify playback end
          if (nextItem.playbackPromiseResolvers?.endResolve) {
            yield* Effect.sync(() => nextItem.playbackPromiseResolvers!.endResolve!)
          }

          // Clean up temp file and remove from queue
          yield* safeAsync(
            () => fileManager.deleteTempFile(nextItem.tempFile!),
            (error) =>
              makeFileOperationError('Failed to cleanup temp file after playback', 'delete', nextItem.tempFile, error)
          )

          yield* Ref.update(queueState, (state) => ({
            ...state,
            queue: removeById(state.queue, nextItem.id),
            currentPlayingItem: null,
          }))

          // Continue processing
          yield* processQueueItems()
        } finally {
          yield* isProcessing.unset
        }
      })

    /**
     * Public API implementation
     */
    const service: EffectQueueManagerService = {
      enqueueTextWithOptions: (text, speaker, options) =>
        Effect.gen(function* () {
          const { item, promises } = yield* createQueueItem(text, speaker, options)

          // Add to queue
          yield* Ref.update(queueState, (state) => ({
            ...state,
            queue: [...state.queue, item],
          }))

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.ITEM_ADDED, item))

          // Generate audio
          const updatedItem = yield* generateAudioForItem(item)

          // Handle immediate playback or queue processing
          if (options?.immediate === true) {
            yield* Effect.fork(playImmediately(updatedItem))
          } else if (options?.immediate !== false) {
            yield* Effect.fork(processQueueItems())
          }

          return { item: updatedItem, promises }
        }),

      enqueueQueryWithOptions: (query, speaker, options) =>
        Effect.gen(function* () {
          const { item, promises } = yield* createQueueItem('(Query generated)', speaker, options, query)

          // Add to queue
          yield* Ref.update(queueState, (state) => ({
            ...state,
            queue: [...state.queue, item],
          }))

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.ITEM_ADDED, item))

          // Generate audio
          const updatedItem = yield* generateAudioForItem(item)

          // Handle immediate playback or queue processing
          if (options?.immediate === true) {
            yield* Effect.fork(playImmediately(updatedItem))
          } else if (options?.immediate !== false) {
            yield* Effect.fork(processQueueItems())
          }

          return { item: updatedItem, promises }
        }),

      removeItem: (itemId) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(queueState)
          const item = state.queue.find((i) => i.id === itemId)

          if (!item) return false

          // Clean up temp file if exists
          if (item.tempFile) {
            yield* safeAsync(
              () => fileManager.deleteTempFile(item.tempFile!),
              (error) =>
                makeFileOperationError('Failed to delete temp file during item removal', 'delete', item.tempFile, error)
            )
          }

          // Remove from queue
          yield* Ref.update(queueState, (s) => ({
            ...s,
            queue: removeById(s.queue, itemId),
            currentPlayingItem: s.currentPlayingItem?.id === itemId ? null : s.currentPlayingItem,
          }))

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.ITEM_REMOVED, item))

          return true
        }),

      clearQueue: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(queueState)

          // Clean up all temp files
          yield* Effect.all(
            state.queue
              .filter((item) => item.tempFile)
              .map((item) =>
                safeAsync(
                  () => fileManager.deleteTempFile(item.tempFile!),
                  (error) =>
                    makeFileOperationError(
                      'Failed to delete temp file during queue clear',
                      'delete',
                      item.tempFile,
                      error
                    )
                )
              ),
            { concurrency: 5 }
          )

          // Clear queue state
          yield* Ref.set(queueState, {
            queue: [],
            isPlaying: false,
            isPaused: false,
            currentPlayingItem: null,
            prefetchSize: state.prefetchSize,
          })

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.QUEUE_CLEARED))
        }),

      startPlayback: () =>
        Effect.gen(function* () {
          yield* Ref.update(queueState, (state) => ({
            ...state,
            isPlaying: true,
            isPaused: false,
          }))

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.PLAYBACK_STARTED))

          yield* Effect.fork(processQueueItems())
        }),

      pausePlayback: () =>
        Effect.gen(function* () {
          yield* Ref.update(queueState, (state) => ({
            ...state,
            isPaused: true,
          }))

          const state = yield* Ref.get(queueState)
          if (state.currentPlayingItem) {
            yield* updateItemStatus(state.currentPlayingItem, QueueItemStatus.PAUSED)
          }

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.PLAYBACK_PAUSED))
        }),

      resumePlayback: () =>
        Effect.gen(function* () {
          yield* Ref.update(queueState, (state) => ({
            ...state,
            isPaused: false,
          }))

          const state = yield* Ref.get(queueState)
          if (state.currentPlayingItem) {
            yield* updateItemStatus(state.currentPlayingItem, QueueItemStatus.PLAYING)
          }

          yield* Effect.sync(() => eventManager.emitEvent(QueueEventType.PLAYBACK_RESUMED))

          yield* Effect.fork(processQueueItems())
        }),

      playNext: () =>
        Effect.gen(function* () {
          yield* Ref.update(queueState, (state) => ({
            ...state,
            isPlaying: true,
            isPaused: false,
          }))

          yield* processQueueItems()
        }),

      getQueue: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(queueState)
          return state.queue
        }),

      getItemStatus: (itemId) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(queueState)
          const item = state.queue.find((i) => i.id === itemId)
          return item?.status || null
        }),

      cleanup: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(queueState)

          // Clean up all temp files
          yield* Effect.all(
            state.queue
              .filter((item) => item.tempFile)
              .map((item) => Effect.sync(() => fileManager.deleteTempFile(item.tempFile!))),
            { concurrency: 5 }
          )

          // Release blob URLs if in browser
          yield* Effect.sync(() => fileManager.releaseAllBlobUrls())

          // Reset state
          yield* Ref.set(queueState, {
            queue: [],
            isPlaying: false,
            isPaused: false,
            currentPlayingItem: null,
            prefetchSize: state.prefetchSize,
          })
        }),
    }

    return service
  })

/**
 * Layer providing the Effect-based queue manager
 */
export const EffectQueueManagerLive = Layer.effect(EffectQueueManagerContext, makeEffectQueueManager())
