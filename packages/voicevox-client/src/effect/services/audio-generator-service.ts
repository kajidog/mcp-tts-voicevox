/**
 * Effect-based AudioGenerator service implementation
 * Provides structured error handling and resource management for audio generation
 */

import { Context, Effect, Layer } from 'effect'
import { AudioGenerator } from '../../queue/audio-generator'
import { type QueueItem, QueueItemStatus } from '../../queue/types'
import type { AudioQuery } from '../../types'
import {
  AudioGeneratorContext,
  type AudioGeneratorService,
  EffectFileManagerContext,
  type EffectFileManagerService,
  type QueueItemData,
  VoicevoxApiContext,
  type VoicevoxApiService,
} from '../context'
import {
  type FileOperationError,
  type QueryGenerationError,
  type SynthesisError,
  makeFileOperationError,
  makeQueryGenerationError,
  makeSynthesisError,
  retryWithBackoff,
  safeAsync,
} from '../errors'
import { logTimed } from '../utils'

/**
 * Enhanced AudioGenerator service with Effect-based operations
 */
export interface EffectAudioGeneratorService extends AudioGeneratorService {
  readonly generateQueryEffect: (text: string, speaker: number) => Effect.Effect<AudioQuery, QueryGenerationError>
  readonly generateAudioEffect: (
    item: QueueItemData,
    updateStatus: (item: QueueItemData, status: string) => Effect.Effect<void, never>
  ) => Effect.Effect<
    QueueItemData,
    QueryGenerationError | SynthesisError | FileOperationError,
    VoicevoxApiService | EffectFileManagerService
  >
  readonly generateAudioFromQueryEffect: (
    item: QueueItemData,
    updateStatus: (item: QueueItemData, status: string) => Effect.Effect<void, never>
  ) => Effect.Effect<QueueItemData, SynthesisError | FileOperationError, VoicevoxApiService | EffectFileManagerService>
  readonly healthCheck: () => Effect.Effect<boolean, never>
}

export const EffectAudioGeneratorContext = Context.GenericTag<EffectAudioGeneratorService>(
  '@voicevox/EffectAudioGenerator'
)

/**
 * Effect-based implementation of AudioGenerator service
 */
export class EffectAudioGeneratorServiceImpl implements EffectAudioGeneratorService {
  constructor(private readonly audioGenerator: AudioGenerator) {}

  /**
   * Traditional generateQuery method (Promise-based)
   */
  generateQuery = (text: string, speaker: number): Promise<any> => this.audioGenerator.generateQuery(text, speaker)

  /**
   * Traditional generateAudioFromQuery method (Promise-based)
   */
  generateAudioFromQuery = (item: any, statusCallback: (item: any, status: string) => void): Promise<void> =>
    this.audioGenerator.generateAudioFromQuery(item, statusCallback)

  /**
   * Traditional generateAudio method (Promise-based)
   */
  generateAudio = (item: any, statusCallback: (item: any, status: string) => void): Promise<void> =>
    this.audioGenerator.generateAudio(item, statusCallback)

  /**
   * Generate audio query with Effect-based error handling
   */
  generateQueryEffect = (text: string, speaker: number): Effect.Effect<AudioQuery, QueryGenerationError> =>
    logTimed(
      `generateQueryEffect-speaker-${speaker}`,
      retryWithBackoff(
        safeAsync(
          () => this.audioGenerator.generateQuery(text, speaker),
          (error) => makeQueryGenerationError('Failed to generate audio query in audio generator', text, speaker, error)
        ),
        3, // max retries
        1000 // base delay 1s
      )
    )

  /**
   * Generate audio from text with Effect-based workflow
   */
  generateAudioEffect = (
    item: QueueItemData,
    updateStatus: (item: QueueItemData, status: string) => Effect.Effect<void, never>
  ): Effect.Effect<
    QueueItemData,
    QueryGenerationError | SynthesisError | FileOperationError,
    VoicevoxApiService | EffectFileManagerService
  > => {
    const self = this
    return logTimed(
      `generateAudioEffect-${item.id}`,
      Effect.gen(function* () {
        // Check if item is in correct status
        if (item.status !== 'pending') {
          return item
        }

        // Update status to generating
        yield* updateStatus(item, 'generating')

        // Generate query
        const query = yield* self.generateQueryEffect(item.text, item.speaker)

        // Get services from context
        const apiService = yield* VoicevoxApiContext
        const fileService = yield* EffectFileManagerContext

        // Synthesize audio
        const audioData = yield* safeAsync(
          () => apiService.getApi().synthesize(query, item.speaker),
          (error) => makeSynthesisError('Failed to synthesize audio in audio generator', item.speaker, error)
        )

        // Save to temporary file
        const tempFile = yield* fileService.saveTempAudioFile(audioData)

        // Update item with generated data
        const updatedItem: QueueItemData = {
          ...item,
          query,
          tempFile,
          status: 'ready',
        }

        // Update status to ready
        yield* updateStatus(updatedItem, 'ready')

        return updatedItem
      })
    )
  }

  /**
   * Generate audio from existing query with Effect-based workflow
   */
  generateAudioFromQueryEffect = (
    item: QueueItemData,
    updateStatus: (item: QueueItemData, status: string) => Effect.Effect<void, never>
  ): Effect.Effect<
    QueueItemData,
    SynthesisError | FileOperationError,
    VoicevoxApiService | EffectFileManagerService
  > => {
    return logTimed(
      `generateAudioFromQueryEffect-${item.id}`,
      Effect.gen(function* () {
        // Check if item is in correct status and has query
        if (item.status !== 'pending' || !item.query) {
          return item
        }

        // Update status to generating
        yield* updateStatus(item, 'generating')

        // Get services from context
        const apiService = yield* VoicevoxApiContext
        const fileService = yield* EffectFileManagerContext

        // Synthesize audio from existing query
        const audioData = yield* safeAsync(
          () => apiService.getApi().synthesize(item.query, item.speaker),
          (error) => makeSynthesisError('Failed to synthesize audio from query in audio generator', item.speaker, error)
        )

        // Save to temporary file
        const tempFile = yield* fileService.saveTempAudioFile(audioData)

        // Update item with generated data
        const updatedItem: QueueItemData = {
          ...item,
          tempFile,
          status: 'ready',
        }

        // Update status to ready
        yield* updateStatus(updatedItem, 'ready')

        return updatedItem
      })
    )
  }

  /**
   * Health check to verify audio generation capabilities
   */
  healthCheck = (): Effect.Effect<boolean, never> => {
    const self = this
    return logTimed(
      'audioGeneratorHealthCheck',
      Effect.gen(function* () {
        // Try to generate a simple query as health check
        const result = yield* self.generateQueryEffect('テスト', 1).pipe(
          Effect.map(() => true),
          Effect.catchAll(() => Effect.succeed(false))
        )
        return result
      })
    )
  }
}

/**
 * Create AudioGenerator service instance
 */
export const makeEffectAudioGeneratorService = (): Effect.Effect<
  EffectAudioGeneratorService,
  never,
  VoicevoxApiService | EffectFileManagerService
> =>
  Effect.gen(function* () {
    const apiService = yield* VoicevoxApiContext
    const fileManager = yield* EffectFileManagerContext

    // Get the underlying VoicevoxApi instance and create a dummy AudioFileManager for the AudioGenerator
    const api = apiService.getApi()

    // We need to create a bridge AudioFileManager that uses our Effect-based file service
    const bridgeFileManager = {
      saveTempAudioFile: (audioData: ArrayBuffer) => Effect.runPromise(fileManager.saveTempAudioFile(audioData)),
      deleteTempFile: (filePath: string) => Effect.runPromise(fileManager.deleteTempFile(filePath)),
      releaseAllBlobUrls: () => Effect.runPromise(fileManager.releaseAllBlobUrls()),
      createTempFilePath: () => Effect.runPromise(fileManager.createTempFilePath()),
      createBlobUrl: (blob: Blob) => Effect.runPromise(fileManager.createBlobUrl(blob)),
      releaseBlobUrl: (url: string) => Effect.runPromise(fileManager.releaseBlobUrl(url)),
    }

    const audioGenerator = new AudioGenerator(api, bridgeFileManager as any)
    return new EffectAudioGeneratorServiceImpl(audioGenerator)
  })

/**
 * Layer providing Effect AudioGenerator service
 */
export const EffectAudioGeneratorServiceLive: Layer.Layer<
  EffectAudioGeneratorService,
  never,
  VoicevoxApiService | EffectFileManagerService
> = Layer.effect(EffectAudioGeneratorContext, makeEffectAudioGeneratorService())

/**
 * Scoped layer that automatically manages resources
 */
export const EffectAudioGeneratorServiceScoped = Layer.scoped(
  EffectAudioGeneratorContext,
  Effect.gen(function* () {
    const service = yield* makeEffectAudioGeneratorService()

    // AudioGenerator doesn't need explicit cleanup but we can add monitoring
    yield* Effect.addFinalizer(() => Effect.log('AudioGenerator service cleaned up'))

    return service
  })
)

/**
 * Helper functions for audio generation workflows
 */

/**
 * Batch generate audio from multiple text inputs
 */
export const batchGenerateAudio = (
  texts: readonly string[],
  speaker: number,
  concurrency = 3
): Effect.Effect<readonly ArrayBuffer[], QueryGenerationError | SynthesisError, VoicevoxApiService> => {
  const apiService = VoicevoxApiContext
  return Effect.gen(function* () {
    const service = yield* apiService
    const api = service.getApi()

    // Generate all audio in parallel with limited concurrency
    const audioDataArray = yield* Effect.all(
      texts.map((text) =>
        Effect.gen(function* () {
          const query = yield* safeAsync(
            () => api.generateQuery(text, speaker),
            (error) => makeQueryGenerationError('Batch query generation failed', text, speaker, error)
          )

          const audioData = yield* safeAsync(
            () => api.synthesize(query, speaker),
            (error) => makeSynthesisError('Batch synthesis failed', speaker, error)
          )

          return audioData
        })
      ),
      { concurrency }
    )

    return audioDataArray
  })
}

/**
 * Generate audio with custom preprocessing
 */
export const generateAudioWithPreprocessing = (
  text: string,
  speaker: number,
  preprocessor: (query: AudioQuery) => AudioQuery
): Effect.Effect<ArrayBuffer, QueryGenerationError | SynthesisError, VoicevoxApiService> => {
  const apiService = VoicevoxApiContext
  return Effect.gen(function* () {
    const service = yield* apiService
    const api = service.getApi()

    // Generate base query
    const baseQuery = yield* safeAsync(
      () => api.generateQuery(text, speaker),
      (error) => makeQueryGenerationError('Failed to generate base query', text, speaker, error)
    )

    // Apply preprocessing
    const processedQuery = preprocessor(baseQuery)

    // Synthesize with processed query
    const audioData = yield* safeAsync(
      () => api.synthesize(processedQuery, speaker),
      (error) => makeSynthesisError('Failed to synthesize processed audio', speaker, error)
    )

    return audioData
  })
}
