/**
 * Effect-based error handling infrastructure
 * Provides structured error types and handling utilities
 */

import { Data, Effect, Schedule } from 'effect'
import { VoicevoxErrorCode } from '../error'

/**
 * Base error class for all VOICEVOX Effect errors
 */
export class VoicevoxEffectError extends Data.TaggedError('VoicevoxEffectError')<{
  readonly code: VoicevoxErrorCode
  readonly message: string
  readonly originalError?: unknown
}> {
  get name() {
    return 'VoicevoxEffectError'
  }

  getDetailedMessage(): string {
    let details = `${this.message} [${this.code}]`

    if (this.originalError instanceof Error) {
      details += `\nOriginal Error: ${this.originalError.message}`
      if (this.originalError.stack) {
        details += `\nStack: ${this.originalError.stack}`
      }
    }

    return details
  }
}

/**
 * Specific error types for different operation categories
 */

export class ApiConnectionError extends Data.TaggedError('ApiConnectionError')<{
  readonly message: string
  readonly url?: string
  readonly originalError?: unknown
}> {}

export class QueryGenerationError extends Data.TaggedError('QueryGenerationError')<{
  readonly message: string
  readonly text?: string
  readonly speakerId?: number
  readonly originalError?: unknown
}> {}

export class SynthesisError extends Data.TaggedError('SynthesisError')<{
  readonly message: string
  readonly speakerId?: number
  readonly originalError?: unknown
}> {}

export class FileOperationError extends Data.TaggedError('FileOperationError')<{
  readonly message: string
  readonly filePath?: string
  readonly operation: 'read' | 'write' | 'delete'
  readonly originalError?: unknown
}> {}

export class PlaybackError extends Data.TaggedError('PlaybackError')<{
  readonly message: string
  readonly filePath?: string
  readonly originalError?: unknown
}> {}

export class QueueOperationError extends Data.TaggedError('QueueOperationError')<{
  readonly message: string
  readonly itemId?: string
  readonly operation: 'enqueue' | 'dequeue' | 'clear' | 'process'
  readonly originalError?: unknown
}> {}

/**
 * Error constructors for easier creation
 */

export const makeApiConnectionError = (message: string, url?: string, originalError?: unknown): ApiConnectionError =>
  new ApiConnectionError({ message, url, originalError })

export const makeQueryGenerationError = (
  message: string,
  text?: string,
  speakerId?: number,
  originalError?: unknown
): QueryGenerationError => new QueryGenerationError({ message, text, speakerId, originalError })

export const makeSynthesisError = (message: string, speakerId?: number, originalError?: unknown): SynthesisError =>
  new SynthesisError({ message, speakerId, originalError })

export const makeFileOperationError = (
  message: string,
  operation: 'read' | 'write' | 'delete',
  filePath?: string,
  originalError?: unknown
): FileOperationError => new FileOperationError({ message, filePath, operation, originalError })

export const makePlaybackError = (message: string, filePath?: string, originalError?: unknown): PlaybackError =>
  new PlaybackError({ message, filePath, originalError })

export const makeQueueOperationError = (
  message: string,
  operation: 'enqueue' | 'dequeue' | 'clear' | 'process',
  itemId?: string,
  originalError?: unknown
): QueueOperationError => new QueueOperationError({ message, itemId, operation, originalError })

/**
 * Effect utilities for error handling
 */

/**
 * Safely execute an async operation with error mapping
 */
export const safeAsync = <A, E>(asyncFn: () => Promise<A>, errorMapper: (error: unknown) => E): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: asyncFn,
    catch: errorMapper,
  })

/**
 * Safely execute a sync operation with error mapping
 */
export const safeSync = <A, E>(syncFn: () => A, errorMapper: (error: unknown) => E): Effect.Effect<A, E> =>
  Effect.try({
    try: syncFn,
    catch: errorMapper,
  })

/**
 * Retry an effect with exponential backoff
 */
export const retryWithBackoff = <A, E>(
  effect: Effect.Effect<A, E>,
  maxRetries = 3,
  baseDelay = 100
): Effect.Effect<A, E> =>
  effect.pipe(Effect.retry(Schedule.exponential(baseDelay).pipe(Schedule.compose(Schedule.recurs(maxRetries)))))

/**
 * Retry an effect with jitter to prevent thundering herd
 */
export const retryWithJitter = <A, E>(
  effect: Effect.Effect<A, E>,
  maxRetries = 3,
  baseDelay = 100
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.retry(
      Schedule.exponential(baseDelay)
        .pipe(Schedule.compose(Schedule.recurs(maxRetries)))
        .pipe(Schedule.jittered)
    )
  )

/**
 * General error for common operations
 */
export class GeneralError extends Data.TaggedError('GeneralError')<{
  readonly message: string
  readonly originalError?: unknown
}> {}

export const makeGeneralError = (message: string, originalError?: unknown): GeneralError =>
  new GeneralError({ message, originalError })

/**
 * Convert an Effect error to a Promise rejection for compatibility
 */
export const toPromise = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect)

/**
 * Convert a Promise to an Effect with proper error handling
 */
export const fromPromise = <A>(
  promise: Promise<A>,
  errorMapper: (error: unknown) => VoicevoxEffectError = (error) =>
    new VoicevoxEffectError({
      code: VoicevoxErrorCode.UNKNOWN_ERROR,
      message: error instanceof Error ? error.message : String(error),
      originalError: error,
    })
): Effect.Effect<A, VoicevoxEffectError> =>
  Effect.tryPromise({
    try: () => promise,
    catch: errorMapper,
  })
