/**
 * Effect-based EventManager service implementation
 * Provides structured event handling and resource management for queue events
 */

import { Context, Effect, Layer, Ref } from 'effect'
import { EventManager } from '../../queue/event-manager'
import { type QueueEventListener, QueueEventType, type QueueItem } from '../../queue/types'
import { EventManagerContext, type EventManagerService } from '../context'
import { type GeneralError, makeGeneralError } from '../errors'
import { logTimed } from '../utils'

/**
 * Effect-based event listener type
 */
export type EffectEventListener = (event: QueueEventType, item?: QueueItem) => Effect.Effect<void, never>

/**
 * Enhanced EventManager service with Effect-based operations
 */
export interface EffectEventManagerService extends EventManagerService {
  readonly addEffectEventListener: (event: QueueEventType, listener: EffectEventListener) => Effect.Effect<void, never>
  readonly removeEffectEventListener: (
    event: QueueEventType,
    listener: EffectEventListener
  ) => Effect.Effect<void, never>
  readonly emitEffectEvent: (event: QueueEventType, item?: QueueItem) => Effect.Effect<void, never>
  readonly getListenerCount: (event: QueueEventType) => Effect.Effect<number, never>
  readonly clearAllListeners: () => Effect.Effect<void, never>
  readonly cleanup: () => Effect.Effect<void, never>
}

export const EffectEventManagerContext = Context.GenericTag<EffectEventManagerService>('@voicevox/EffectEventManager')

/**
 * Effect-based implementation of EventManager service
 */
export class EffectEventManagerServiceImpl implements EffectEventManagerService {
  private readonly effectListeners: Ref.Ref<Map<QueueEventType, EffectEventListener[]>>

  constructor(
    private readonly eventManager: EventManager,
    effectListeners: Ref.Ref<Map<QueueEventType, EffectEventListener[]>>
  ) {
    this.effectListeners = effectListeners
  }

  /**
   * Add traditional event listener (synchronous)
   */
  addEventListener = (eventType: string, listener: (...args: any[]) => void): void => {
    if (Object.values(QueueEventType).includes(eventType as QueueEventType)) {
      this.eventManager.addEventListener(eventType as QueueEventType, listener as QueueEventListener)
    }
  }

  /**
   * Remove traditional event listener (synchronous)
   */
  removeEventListener = (eventType: string, listener: (...args: any[]) => void): void => {
    if (Object.values(QueueEventType).includes(eventType as QueueEventType)) {
      this.eventManager.removeEventListener(eventType as QueueEventType, listener as QueueEventListener)
    }
  }

  /**
   * Emit traditional event (synchronous)
   */
  emitEvent = (eventType: string, data?: any): void => {
    if (Object.values(QueueEventType).includes(eventType as QueueEventType)) {
      this.eventManager.emitEvent(eventType as QueueEventType, data as QueueItem)
    }
  }

  /**
   * Add Effect-based event listener with proper resource management
   */
  addEffectEventListener = (event: QueueEventType, listener: EffectEventListener): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      `addEffectEventListener-${event}`,
      Ref.update(self.effectListeners, (listeners) => {
        const eventListeners = listeners.get(event) || []
        if (!eventListeners.includes(listener)) {
          eventListeners.push(listener)
          listeners.set(event, eventListeners)
        }
        return listeners
      })
    )
  }

  /**
   * Remove Effect-based event listener
   */
  removeEffectEventListener = (event: QueueEventType, listener: EffectEventListener): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      `removeEffectEventListener-${event}`,
      Ref.update(self.effectListeners, (listeners) => {
        const eventListeners = listeners.get(event) || []
        const index = eventListeners.indexOf(listener)
        if (index !== -1) {
          eventListeners.splice(index, 1)
          listeners.set(event, eventListeners)
        }
        return listeners
      })
    )
  }

  /**
   * Emit event to both traditional and Effect-based listeners
   */
  emitEffectEvent = (event: QueueEventType, item?: QueueItem): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      `emitEffectEvent-${event}`,
      Effect.gen(function* () {
        // Emit to traditional listeners (synchronous)
        self.eventManager.emitEvent(event, item)

        // Emit to Effect-based listeners (asynchronous)
        const listeners = yield* Ref.get(self.effectListeners)
        const eventListeners = listeners.get(event) || []

        if (eventListeners.length > 0) {
          // Run all Effect listeners in parallel
          yield* Effect.all(
            eventListeners.map((listener) =>
              listener(event, item).pipe(
                Effect.catchAll((error) => {
                  // Log listener errors but don't fail the emission
                  console.error(`Effect event listener error (${event}):`, error)
                  return Effect.void
                })
              )
            ),
            { concurrency: 'unbounded' }
          )
        }
      })
    )
  }

  /**
   * Get the number of listeners for a specific event type
   */
  getListenerCount = (event: QueueEventType): Effect.Effect<number, never> => {
    const self = this
    return Effect.gen(function* () {
      const listeners = yield* Ref.get(self.effectListeners)
      const eventListeners = listeners.get(event) || []
      return eventListeners.length
    })
  }

  /**
   * Clear all Effect-based event listeners
   */
  clearAllListeners = (): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      'clearAllListeners',
      Effect.gen(function* () {
        yield* Ref.set(self.effectListeners, new Map())
      })
    )
  }

  /**
   * Cleanup all resources and listeners
   */
  cleanup = (): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      'eventManagerCleanup',
      Effect.gen(function* () {
        // Clear all Effect-based listeners
        yield* self.clearAllListeners()

        // Note: Traditional listeners are managed by the underlying EventManager
        // and will be cleaned up when the service is disposed
      })
    )
  }
}

/**
 * Create EventManager service instance
 */
export const makeEffectEventManagerService = (): Effect.Effect<EffectEventManagerService, never> =>
  Effect.gen(function* () {
    const eventManager = new EventManager()
    const effectListeners = yield* Ref.make(new Map<QueueEventType, EffectEventListener[]>())

    // Initialize Effect listeners map with empty arrays for each event type
    const initialMap = new Map<QueueEventType, EffectEventListener[]>()
    for (const eventType of Object.values(QueueEventType)) {
      initialMap.set(eventType, [])
    }
    yield* Ref.set(effectListeners, initialMap)

    return new EffectEventManagerServiceImpl(eventManager, effectListeners)
  })

/**
 * Layer providing Effect EventManager service
 */
export const EffectEventManagerServiceLive: Layer.Layer<EffectEventManagerService, never> = Layer.effect(
  EffectEventManagerContext,
  makeEffectEventManagerService()
)

/**
 * Scoped layer that automatically cleans up resources on scope close
 */
export const EffectEventManagerServiceScoped = Layer.scoped(
  EffectEventManagerContext,
  Effect.gen(function* () {
    const service = yield* makeEffectEventManagerService()

    // Add finalizer to cleanup resources when scope closes
    yield* Effect.addFinalizer(() => service.cleanup())

    return service
  })
)

/**
 * Helper functions for common event operations
 */

/**
 * Subscribe to multiple events with a single listener
 */
export const subscribeToEvents = (
  events: QueueEventType[],
  listener: EffectEventListener
): Effect.Effect<void, never, EffectEventManagerService> => {
  const eventService = EffectEventManagerContext
  return Effect.gen(function* () {
    const service = yield* eventService
    yield* Effect.all(
      events.map((event) => service.addEffectEventListener(event, listener)),
      { concurrency: 'unbounded' }
    )
  })
}

/**
 * Create a temporary event subscription that automatically unsubscribes when the scope closes
 */
export const withEventSubscription = <A, E>(
  event: QueueEventType,
  listener: EffectEventListener,
  program: Effect.Effect<A, E, EffectEventManagerService>
): Effect.Effect<A, E, EffectEventManagerService> => {
  const eventService = EffectEventManagerContext
  return Effect.gen(function* () {
    const service = yield* eventService

    // Subscribe to the event
    yield* service.addEffectEventListener(event, listener)

    // Run the program with automatic cleanup
    return yield* Effect.acquireUseRelease(
      Effect.void,
      () => program,
      () => service.removeEffectEventListener(event, listener)
    )
  })
}

/**
 * Wait for a specific event to occur
 */
export const waitForEvent = (
  event: QueueEventType,
  predicate?: (item?: QueueItem) => boolean
): Effect.Effect<QueueItem | undefined, never, EffectEventManagerService> => {
  const eventService = EffectEventManagerContext
  return Effect.gen(function* () {
    const service = yield* eventService

    return yield* Effect.async<QueueItem | undefined, never>((resume) => {
      const listener: EffectEventListener = (eventType, item) =>
        Effect.sync(() => {
          if (eventType === event && (!predicate || predicate(item))) {
            resume(Effect.succeed(item))
          }
        })

      // Subscribe to the event
      Effect.runPromise(service.addEffectEventListener(event, listener))

      // Return cleanup function
      return Effect.sync(() => {
        Effect.runPromise(service.removeEffectEventListener(event, listener))
      })
    })
  })
}
