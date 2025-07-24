/**
 * Effect.ts infrastructure for VOICEVOX
 *
 * This module provides a complete Effect-based foundation for:
 * - Structured error handling with detailed error types
 * - Dependency injection through Context system
 * - Resource management with automatic cleanup
 * - Async operation coordination with fibers
 * - Configuration management
 * - Logging and observability
 *
 * Usage:
 * ```ts
 * import { Effect } from 'effect'
 * import { AppLayer, VoicevoxApiContext, safeAsync } from './effect'
 *
 * const program = Effect.gen(function* () {
 *   const api = yield* VoicevoxApiContext
 *   // ... your Effect-based logic
 * })
 *
 * Effect.runPromise(program.pipe(Effect.provide(AppLayer)))
 * ```
 */

// Configuration and setup
export * from './config'

// Error handling
export * from './errors'

// Context definitions for dependency injection
export * from './context'

// Utility functions and common patterns
export * from './utils'

// Queue management
export * from './queue-manager'

// Service layers
export * from './services/api-service'
export * from './services/file-manager-service'
export * from './services/event-manager-service'
export * from './services/audio-generator-service'
export * from './services/audio-player-service'

// Re-export commonly used Effect modules for convenience
export { Effect, Context, Layer, Scope, Logger, Schedule, Duration, Option, Either } from 'effect'
