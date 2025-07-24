/**
 * Effect-based VoicevoxApi service implementation
 * Provides structured error handling and resource management for VOICEVOX API operations
 */

import { Context, Effect, Layer } from 'effect'
import { VoicevoxApi } from '../../api'
import type { AudioQuery, Speaker } from '../../types'
import { VoicevoxApiContext, type VoicevoxApiService } from '../context'
import {
  type ApiConnectionError,
  type QueryGenerationError,
  type SynthesisError,
  makeApiConnectionError,
  makeQueryGenerationError,
  makeSynthesisError,
  retryWithBackoff,
  safeAsync,
} from '../errors'
import { logTimed } from '../utils'

/**
 * Effect-based implementation of VoicevoxApi service
 */
export class EffectVoicevoxApiService implements VoicevoxApiService {
  constructor(private readonly api: VoicevoxApi) {}

  getApi(): VoicevoxApi {
    return this.api
  }

  /**
   * Generate audio query from text with Effect-based error handling
   */
  generateQuery = (text: string, speaker = 1): Effect.Effect<AudioQuery, QueryGenerationError> =>
    logTimed(
      `generateQuery-speaker-${speaker}`,
      retryWithBackoff(
        safeAsync(
          () => this.api.generateQuery(text, speaker),
          (error) => makeQueryGenerationError('Failed to generate audio query', text, speaker, error)
        ),
        3, // max retries
        1000 // base delay 1s
      )
    )

  /**
   * Synthesize audio from query with Effect-based error handling
   */
  synthesize = (query: AudioQuery, speaker = 1): Effect.Effect<ArrayBuffer, SynthesisError> =>
    logTimed(
      `synthesize-speaker-${speaker}`,
      retryWithBackoff(
        safeAsync(
          () => this.api.synthesize(query, speaker),
          (error) => makeSynthesisError('Failed to synthesize audio', speaker, error)
        ),
        2, // fewer retries for synthesis
        2000 // longer base delay 2s
      )
    )

  /**
   * Generate audio query from preset with Effect-based error handling
   */
  generateQueryFromPreset = (
    text: string,
    presetId: number,
    coreVersion?: string
  ): Effect.Effect<AudioQuery, QueryGenerationError> =>
    logTimed(
      `generateQueryFromPreset-${presetId}`,
      retryWithBackoff(
        safeAsync(
          () => this.api.generateQueryFromPreset(text, presetId, coreVersion),
          (error) => makeQueryGenerationError('Failed to generate query from preset', text, presetId, error)
        ),
        3,
        1000
      )
    )

  /**
   * Get speakers list with Effect-based error handling
   */
  getSpeakers = (): Effect.Effect<Speaker[], ApiConnectionError> =>
    logTimed(
      'getSpeakers',
      retryWithBackoff(
        safeAsync(
          () => this.api.getSpeakers(),
          (error) => makeApiConnectionError('Failed to get speakers list', undefined, error)
        ),
        3,
        1000
      )
    )

  /**
   * Get speaker info with Effect-based error handling
   */
  getSpeakerInfo = (uuid: string): Effect.Effect<Speaker, ApiConnectionError> =>
    logTimed(
      `getSpeakerInfo-${uuid}`,
      retryWithBackoff(
        safeAsync(
          () => this.api.getSpeakerInfo(uuid),
          (error) => makeApiConnectionError('Failed to get speaker info', uuid, error)
        ),
        3,
        1000
      )
    )

  /**
   * Combined operation: generate query and synthesize in one Effect workflow
   */
  generateAndSynthesize = (
    text: string,
    speaker = 1
  ): Effect.Effect<ArrayBuffer, QueryGenerationError | SynthesisError> => {
    const self = this
    return Effect.gen(function* () {
      // Generate query first
      const query = yield* self.generateQuery(text, speaker)

      // Then synthesize audio
      const audioData = yield* self.synthesize(query, speaker)

      return audioData
    })
  }

  /**
   * Health check operation to verify API connectivity
   */
  healthCheck = (): Effect.Effect<boolean, never> => {
    const self = this
    return Effect.gen(function* () {
      // Try to get speakers as a health check
      const result = yield* self.getSpeakers().pipe(
        Effect.map(() => true),
        Effect.catchAll(() => Effect.succeed(false))
      )
      return result
    })
  }
}

/**
 * Create VoicevoxApi service instance from base URL
 */
export const makeVoicevoxApiService = (baseUrl: string): Effect.Effect<VoicevoxApiService, never> =>
  Effect.sync(() => {
    const api = new VoicevoxApi(baseUrl)
    return new EffectVoicevoxApiService(api)
  })

/**
 * Layer providing VoicevoxApi service from configuration
 */
export const VoicevoxApiServiceLive = (baseUrl: string): Layer.Layer<VoicevoxApiService, never, never> =>
  Layer.effect(VoicevoxApiContext, makeVoicevoxApiService(baseUrl))

/**
 * Layer providing VoicevoxApi service with default configuration
 */
export const VoicevoxApiServiceDefault = VoicevoxApiServiceLive('http://localhost:50021')
