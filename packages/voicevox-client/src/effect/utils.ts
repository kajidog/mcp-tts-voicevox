/**
 * Effect utility functions and common patterns
 * Provides reusable Effect combinators for the VOICEVOX system
 */

import { Deferred, Duration, Effect, Option, Ref, Schedule, Scope } from 'effect'
import { type VoicevoxEffectError, makeQueueOperationError } from './errors'

/**
 * Resource management utilities
 */

/**
 * Safely execute an operation with automatic cleanup
 */
export const withResource = <R, E, A, B>(
  acquire: Effect.Effect<A, E, R>,
  release: (resource: A) => Effect.Effect<void, never, R>,
  use: (resource: A) => Effect.Effect<B, E, R>
): Effect.Effect<B, E, R> => Effect.acquireUseRelease(acquire, use, release)

/**
 * Manage a temporary file with automatic cleanup
 */
export const withTempFile = <R, E, A>(
  createFile: () => Effect.Effect<string, E, R>,
  deleteFile: (path: string) => Effect.Effect<void, never, R>,
  use: (filePath: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => withResource(createFile(), deleteFile, use)

/**
 * Async coordination utilities
 */

/**
 * Create a deferred promise that can be resolved later
 */
export const createDeferred = <A>(): Effect.Effect<Deferred.Deferred<A, never>, never> => Deferred.make<A, never>()

/**
 * Wait for a condition to be true with timeout
 */
export const waitForCondition = <R, E>(
  condition: Effect.Effect<boolean, E, R>,
  timeout: Duration.Duration,
  checkInterval: Duration.Duration = Duration.millis(50)
): Effect.Effect<void, E | Error, R> =>
  Effect.gen(function* () {
    const deadline = yield* Effect.sync(() => Date.now() + Duration.toMillis(timeout))

    while (true) {
      const isReady = yield* condition
      if (isReady) return

      if (Date.now() > deadline) {
        throw new Error('Condition timeout')
      }

      yield* Effect.sleep(checkInterval)
    }
  })

/**
 * Execute effects in parallel with concurrency limit
 */
export const parallelWithLimit = <R, E, A>(
  effects: readonly Effect.Effect<A, E, R>[],
  concurrency: number
): Effect.Effect<readonly A[], E, R> => Effect.all(effects, { concurrency })

/**
 * Queue utilities
 */

/**
 * Process items from a queue with a given processor function
 */
export const processQueueItems = <A, R, E>(
  getItems: Effect.Effect<readonly A[], E, R>,
  processItem: (item: A) => Effect.Effect<void, E, R>,
  maxConcurrency = 1
): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    const items = yield* getItems
    if (items.length === 0) return

    yield* parallelWithLimit(items.map(processItem), maxConcurrency)
  })

/**
 * State management utilities
 */

/**
 * Create a thread-safe counter
 */
export const createCounter = (
  initialValue = 0
): Effect.Effect<
  {
    readonly increment: Effect.Effect<number, never>
    readonly decrement: Effect.Effect<number, never>
    readonly get: Effect.Effect<number, never>
    readonly set: (value: number) => Effect.Effect<void, never>
  },
  never
> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make(initialValue)

    return {
      increment: Ref.updateAndGet(ref, (n) => n + 1),
      decrement: Ref.updateAndGet(ref, (n) => n - 1),
      get: Ref.get(ref),
      set: (value: number) => Ref.set(ref, value),
    }
  })

/**
 * Create a thread-safe boolean flag
 */
export const createFlag = (
  initialValue = false
): Effect.Effect<
  {
    readonly set: Effect.Effect<void, never>
    readonly unset: Effect.Effect<void, never>
    readonly get: Effect.Effect<boolean, never>
    readonly toggle: Effect.Effect<boolean, never>
  },
  never
> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make(initialValue)

    return {
      set: Ref.set(ref, true),
      unset: Ref.set(ref, false),
      get: Ref.get(ref),
      toggle: Ref.updateAndGet(ref, (b) => !b),
    }
  })

/**
 * Scheduling utilities
 */

/**
 * Execute with timeout
 */
export const withTimeout = <R, E, A>(
  effect: Effect.Effect<A, E, R>,
  timeout: Duration.Duration
): Effect.Effect<A, E | Error, R> =>
  Effect.race(
    effect,
    Effect.sleep(timeout).pipe(
      Effect.andThen(Effect.fail(new Error(`Operation timed out after ${Duration.toMillis(timeout)}ms`)))
    )
  )

/**
 * Logging utilities
 */

/**
 * Log an effect's execution with timing
 */
export const logTimed = <R, E, A>(label: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const start = yield* Effect.sync(() => Date.now())
    yield* Effect.log(`[${label}] Starting...`)

    const result = yield* effect

    const end = yield* Effect.sync(() => Date.now())
    yield* Effect.log(`[${label}] Completed in ${end - start}ms`)

    return result
  })

/**
 * Collection utilities
 */

/**
 * Find the first item in a collection that matches a predicate
 */
export const findFirst = <A>(items: readonly A[], predicate: (item: A) => boolean): Option.Option<A> =>
  Option.fromNullable(items.find(predicate))

/**
 * Remove an item from an array by ID
 */
export const removeById = <A extends { id: string }>(items: readonly A[], id: string): readonly A[] =>
  items.filter((item) => item.id !== id)

/**
 * Update an item in an array by ID
 */
export const updateById = <A extends { id: string }>(
  items: readonly A[],
  id: string,
  updater: (item: A) => A
): readonly A[] => items.map((item) => (item.id === id ? updater(item) : item))

/**
 * Error handling utilities
 */

/**
 * Catch and transform errors
 */
export const catchAndMap = <R, E1, E2, A>(
  effect: Effect.Effect<A, E1, R>,
  mapper: (error: E1) => E2
): Effect.Effect<A, E2, R> => effect.pipe(Effect.catchAll((error) => Effect.fail(mapper(error))))

/**
 * Provide a fallback value in case of error
 */
export const orElse = <R, E, A>(effect: Effect.Effect<A, E, R>, fallback: A): Effect.Effect<A, never, R> =>
  effect.pipe(Effect.orElse(() => Effect.succeed(fallback)))

/**
 * Convert common patterns to Effect-friendly operations
 */

/**
 * Convert a callback-based operation to Effect
 */
export const fromCallback = <A, E = Error>(
  fn: (callback: (error: E | null, result?: A) => void) => void
): Effect.Effect<A, E> =>
  Effect.async<A, E>((resume) => {
    fn((error, result) => {
      if (error) {
        resume(Effect.fail(error))
      } else if (result !== undefined) {
        resume(Effect.succeed(result))
      } else {
        resume(Effect.fail(new Error('No result provided') as E))
      }
    })
  })

/**
 * Convert an event-based operation to Effect with timeout
 */
export const fromEvent = <A>(
  target: {
    addEventListener: (eventName: string, handler: (event: A) => void) => void
    removeEventListener: (eventName: string, handler: (event: A) => void) => void
  },
  eventName: string,
  timeout?: Duration.Duration
): Effect.Effect<A, Error> =>
  Effect.async<A, Error>((resume) => {
    const handler = (event: A) => {
      target.removeEventListener(eventName, handler)
      resume(Effect.succeed(event))
    }

    target.addEventListener(eventName, handler)

    if (timeout) {
      const timeoutId = setTimeout(() => {
        target.removeEventListener(eventName, handler)
        resume(Effect.fail(new Error(`Event ${eventName} timed out`)))
      }, Duration.toMillis(timeout))

      return Effect.sync(() => clearTimeout(timeoutId))
    }

    return Effect.void
  })
