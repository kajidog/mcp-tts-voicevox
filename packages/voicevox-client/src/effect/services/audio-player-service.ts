/**
 * Effect-based AudioPlayer service implementation
 * Provides structured error handling and resource management for audio playback
 */

import { Context, Effect, Fiber, Layer, Ref, Scope } from 'effect'
import { Duration } from 'effect'
import { AudioPlayer } from '../../queue/audio-player'
import { AudioPlayerContext, type AudioPlayerService } from '../context'
import { type PlaybackError, makePlaybackError, retryWithJitter, safeAsync } from '../errors'
import { logTimed, withTimeout } from '../utils'

/**
 * Enhanced AudioPlayer service with Effect-based operations
 */
export interface EffectAudioPlayerService extends AudioPlayerService {
  readonly playAudioEffect: (filePath: string) => Effect.Effect<void, PlaybackError>
  readonly playAudioWithTimeout: (filePath: string, timeoutMs: number) => Effect.Effect<void, PlaybackError>
  readonly playAudioWithRetry: (filePath: string, maxRetries?: number) => Effect.Effect<void, PlaybackError>
  readonly isPlaying: () => Effect.Effect<boolean, never>
  readonly stopPlayback: () => Effect.Effect<void, never>
  readonly healthCheck: () => Effect.Effect<boolean, never>
  readonly cleanup: () => Effect.Effect<void, never>
}

export const EffectAudioPlayerContext = Context.GenericTag<EffectAudioPlayerService>('@voicevox/EffectAudioPlayer')

/**
 * Audio playback state for tracking
 */
interface AudioPlayerState {
  readonly isPlaying: boolean
  readonly currentFilePath?: string
  readonly playbackStartTime?: Date
}

/**
 * Effect-based implementation of AudioPlayer service
 */
export class EffectAudioPlayerServiceImpl implements EffectAudioPlayerService {
  private readonly playerState: Ref.Ref<AudioPlayerState>

  constructor(
    private readonly audioPlayer: AudioPlayer,
    playerState: Ref.Ref<AudioPlayerState>
  ) {
    this.playerState = playerState
  }

  /**
   * Traditional playAudio method (Promise-based)
   */
  playAudio = (filePath: string): Promise<void> => this.audioPlayer.playAudio(filePath)

  /**
   * Play audio with Effect-based error handling and state management
   */
  playAudioEffect = (filePath: string): Effect.Effect<void, PlaybackError> => {
    const self = this
    return logTimed(
      `playAudioEffect-${filePath}`,
      Effect.gen(function* () {
        // Update state to playing
        yield* Ref.update(self.playerState, (state) => ({
          ...state,
          isPlaying: true,
          currentFilePath: filePath,
          playbackStartTime: new Date(),
        }))

        try {
          // Perform the actual playback
          yield* safeAsync(
            () => self.audioPlayer.playAudio(filePath),
            (error) => makePlaybackError('Failed to play audio file', filePath, error)
          )

          // Update state to not playing
          yield* Ref.update(self.playerState, (state) => ({
            ...state,
            isPlaying: false,
            currentFilePath: undefined,
            playbackStartTime: undefined,
          }))
        } catch (error) {
          // Ensure state is reset on error
          yield* Ref.update(self.playerState, (state) => ({
            ...state,
            isPlaying: false,
            currentFilePath: undefined,
            playbackStartTime: undefined,
          }))
          throw error
        }
      })
    )
  }

  /**
   * Play audio with timeout protection
   */
  playAudioWithTimeout = (filePath: string, timeoutMs: number): Effect.Effect<void, PlaybackError> =>
    logTimed(
      `playAudioWithTimeout-${filePath}-${timeoutMs}ms`,
      withTimeout(this.playAudioEffect(filePath), Duration.millis(timeoutMs)).pipe(
        Effect.mapError((error) =>
          error instanceof Error && error.message.includes('timeout')
            ? makePlaybackError('Audio playback timed out', filePath, error)
            : (error as PlaybackError)
        )
      )
    )

  /**
   * Play audio with retry logic
   */
  playAudioWithRetry = (filePath: string, maxRetries = 3): Effect.Effect<void, PlaybackError> =>
    logTimed(
      `playAudioWithRetry-${filePath}-retries-${maxRetries}`,
      retryWithJitter(this.playAudioEffect(filePath), maxRetries, 500)
    )

  /**
   * Check if audio is currently playing
   */
  isPlaying = (): Effect.Effect<boolean, never> => {
    const self = this
    return Ref.get(self.playerState).pipe(Effect.map((state) => state.isPlaying))
  }

  /**
   * Stop current playback (best effort, may not work on all platforms)
   */
  stopPlayback = (): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      'stopPlayback',
      Effect.gen(function* () {
        // Update state to not playing
        yield* Ref.update(self.playerState, (state) => ({
          ...state,
          isPlaying: false,
          currentFilePath: undefined,
          playbackStartTime: undefined,
        }))

        // Note: Actual stopping of playback depends on platform and implementation
        // This is mainly for state management
        yield* Effect.log('Playback stopped (state updated)')
      })
    )
  }

  /**
   * Health check to verify audio playback capabilities
   */
  healthCheck = (): Effect.Effect<boolean, never> => {
    const self = this
    return logTimed(
      'audioPlayerHealthCheck',
      Effect.gen(function* () {
        // Check if we can create an AudioPlayer instance without errors
        const result = yield* Effect.sync(() => {
          try {
            // Simple validation - check if required dependencies are available
            return typeof self.audioPlayer.playAudio === 'function'
          } catch {
            return false
          }
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
        return result
      })
    )
  }

  /**
   * Clean up audio player resources
   */
  cleanup = (): Effect.Effect<void, never> => {
    const self = this
    return logTimed(
      'audioPlayerCleanup',
      Effect.gen(function* () {
        // Stop any current playback
        yield* self.stopPlayback()

        // Reset state
        yield* Ref.set(self.playerState, {
          isPlaying: false,
          currentFilePath: undefined,
          playbackStartTime: undefined,
        })

        yield* Effect.log('AudioPlayer service cleaned up')
      })
    )
  }
}

/**
 * Create AudioPlayer service instance
 */
export const makeEffectAudioPlayerService = (): Effect.Effect<EffectAudioPlayerService, never> =>
  Effect.gen(function* () {
    const audioPlayer = new AudioPlayer()
    const playerState = yield* Ref.make<AudioPlayerState>({
      isPlaying: false,
      currentFilePath: undefined,
      playbackStartTime: undefined,
    })

    return new EffectAudioPlayerServiceImpl(audioPlayer, playerState)
  })

/**
 * Layer providing Effect AudioPlayer service
 */
export const EffectAudioPlayerServiceLive: Layer.Layer<EffectAudioPlayerService, never> = Layer.effect(
  EffectAudioPlayerContext,
  makeEffectAudioPlayerService()
)

/**
 * Scoped layer that automatically cleans up resources on scope close
 */
export const EffectAudioPlayerServiceScoped = Layer.scoped(
  EffectAudioPlayerContext,
  Effect.gen(function* () {
    const service = yield* makeEffectAudioPlayerService()

    // Add finalizer to cleanup resources when scope closes
    yield* Effect.addFinalizer(() => service.cleanup())

    return service
  })
)

/**
 * Helper functions for audio playback workflows
 */

/**
 * Play multiple audio files in sequence
 */
export const playAudioSequence = (
  filePaths: readonly string[]
): Effect.Effect<void, PlaybackError, EffectAudioPlayerService> => {
  const playerService = EffectAudioPlayerContext
  return Effect.gen(function* () {
    const service = yield* playerService

    // Play each file in sequence
    for (const filePath of filePaths) {
      yield* service.playAudioEffect(filePath)
    }
  })
}

/**
 * Play multiple audio files in parallel (useful for sound effects)
 */
export const playAudioParallel = (
  filePaths: readonly string[],
  concurrency = 3
): Effect.Effect<void, PlaybackError, EffectAudioPlayerService> => {
  const playerService = EffectAudioPlayerContext
  return Effect.gen(function* () {
    const service = yield* playerService

    // Play all files in parallel with limited concurrency
    yield* Effect.all(
      filePaths.map((filePath) => service.playAudioEffect(filePath)),
      { concurrency }
    )
  })
}

/**
 * Play audio with progress monitoring
 */
export const playAudioWithProgress = (
  filePath: string,
  onProgress?: (elapsed: number) => void
): Effect.Effect<void, PlaybackError, EffectAudioPlayerService> => {
  const playerService = EffectAudioPlayerContext
  return Effect.gen(function* () {
    const service = yield* playerService

    if (!onProgress) {
      return yield* service.playAudioEffect(filePath)
    }

    // Start playback in a fiber
    const playbackFiber = yield* Effect.fork(service.playAudioEffect(filePath))

    // Monitor progress
    const progressFiber = yield* Effect.fork(
      Effect.gen(function* () {
        const startTime = Date.now()

        while (true) {
          const isPlaying = yield* service.isPlaying()
          if (!isPlaying) break

          const elapsed = Date.now() - startTime
          onProgress(elapsed)

          yield* Effect.sleep(Duration.millis(100))
        }
      })
    )

    // Wait for playback to complete
    yield* Fiber.await(playbackFiber)

    // Interrupt progress monitoring
    yield* Fiber.interrupt(progressFiber)
  })
}

/**
 * Create a managed audio player that automatically stops on scope exit
 */
export const withManagedAudioPlayer = <A, E>(
  program: Effect.Effect<A, E, EffectAudioPlayerService>
): Effect.Effect<A, E, EffectAudioPlayerService> => {
  const playerService = EffectAudioPlayerContext
  return Effect.gen(function* () {
    const service = yield* playerService

    return yield* Effect.acquireUseRelease(
      Effect.void,
      () => program,
      () => service.stopPlayback()
    )
  })
}
