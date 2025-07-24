/**
 * Effect-based AudioFileManager service implementation
 * Provides structured error handling and resource management for file operations
 */

import { Context, Effect, Layer, type Scope } from 'effect'
import { AudioFileManager } from '../../queue/file-manager'
import { EffectFileManagerContext, type EffectFileManagerService } from '../context'
import { type FileOperationError, makeFileOperationError, safeAsync, safeSync } from '../errors'
import { logTimed } from '../utils'

/**
 * Effect-based implementation of AudioFileManager service
 */
export class EffectFileManagerServiceImpl implements EffectFileManagerService {
  constructor(private readonly fileManager: AudioFileManager) {}

  /**
   * Save audio data to temporary file with Effect-based error handling
   */
  saveTempAudioFile = (audioData: ArrayBuffer): Effect.Effect<string, FileOperationError> =>
    logTimed(
      'saveTempAudioFile',
      safeAsync(
        () => this.fileManager.saveTempAudioFile(audioData),
        (error) => makeFileOperationError('Failed to save audio data to temporary file', 'write', undefined, error)
      )
    )

  /**
   * Save audio data to specific file path with Effect-based error handling
   */
  saveAudioFile = (
    audioData: ArrayBuffer,
    output: string,
    forceDownload = true
  ): Effect.Effect<string, FileOperationError> =>
    logTimed(
      `saveAudioFile-${output}`,
      safeAsync(
        () => this.fileManager.saveAudioFile(audioData, output, forceDownload),
        (error) => makeFileOperationError('Failed to save audio file', 'write', output, error)
      )
    )

  /**
   * Delete temporary file with Effect-based error handling
   */
  deleteTempFile = (filePath: string): Effect.Effect<void, FileOperationError> =>
    logTimed(
      `deleteTempFile-${filePath}`,
      safeAsync(
        () => this.fileManager.deleteTempFile(filePath),
        (error) => makeFileOperationError('Failed to delete temporary file', 'delete', filePath, error)
      )
    )

  /**
   * Create temporary file path with Effect-based error handling
   */
  createTempFilePath = (): Effect.Effect<string, FileOperationError> =>
    safeSync(
      () => this.fileManager.createTempFilePath(),
      (error) => makeFileOperationError('Failed to create temporary file path', 'write', undefined, error)
    )

  /**
   * Create blob URL with Effect-based error handling
   */
  createBlobUrl = (blob: Blob): Effect.Effect<string, FileOperationError> =>
    safeSync(
      () => this.fileManager.createBlobUrl(blob),
      (error) => makeFileOperationError('Failed to create blob URL', 'write', undefined, error)
    )

  /**
   * Release blob URL (infallible operation)
   */
  releaseBlobUrl = (url: string): Effect.Effect<void, never> => Effect.sync(() => this.fileManager.releaseBlobUrl(url))

  /**
   * Release all blob URLs (infallible operation)
   */
  releaseAllBlobUrls = (): Effect.Effect<void, never> => Effect.sync(() => this.fileManager.releaseAllBlobUrls())

  /**
   * Create temporary file with automatic cleanup using Scope
   */
  withTempFile = <A, E>(
    audioData: ArrayBuffer,
    use: (filePath: string) => Effect.Effect<A, E>
  ): Effect.Effect<A, E | FileOperationError> => {
    const self = this
    return Effect.gen(function* () {
      // Create temp file
      const filePath = yield* self.saveTempAudioFile(audioData)

      // Use the file with automatic cleanup
      return yield* Effect.acquireUseRelease(Effect.succeed(filePath), use, (path) =>
        self.deleteTempFile(path).pipe(
          Effect.catchAll((error) => {
            // Log cleanup errors but don't fail the operation
            console.warn(`Failed to cleanup temp file ${path}:`, error)
            return Effect.void
          })
        )
      )
    })
  }

  /**
   * Batch delete multiple temporary files
   */
  deleteMultipleTempFiles = (filePaths: readonly string[]): Effect.Effect<void, FileOperationError> => {
    const self = this
    return Effect.gen(function* () {
      // Delete all files in parallel with limited concurrency
      yield* Effect.all(
        filePaths.map((path) => self.deleteTempFile(path)),
        { concurrency: 5 }
      )
    })
  }

  /**
   * Create multiple temporary files from audio data array
   */
  saveMultipleTempAudioFiles = (
    audioDataArray: readonly ArrayBuffer[]
  ): Effect.Effect<readonly string[], FileOperationError> => {
    const self = this
    return Effect.gen(function* () {
      // Save all files in parallel with limited concurrency
      const filePaths = yield* Effect.all(
        audioDataArray.map((data) => self.saveTempAudioFile(data)),
        { concurrency: 3 }
      )
      return filePaths
    })
  }

  /**
   * Get file size information (Node.js only, returns null in browser)
   */
  getFileSize = (filePath: string): Effect.Effect<number | null, FileOperationError> =>
    safeAsync(
      async () => {
        // This would require fs.stat in Node.js environment
        // For now, return null as a placeholder
        return null
      },
      (error) => makeFileOperationError('Failed to get file size', 'read', filePath, error)
    )

  /**
   * Clean up all resources (blob URLs and temp files)
   */
  cleanup = (): Effect.Effect<void, never> => {
    const self = this
    return Effect.gen(function* () {
      // Release all blob URLs
      yield* self.releaseAllBlobUrls()

      // Note: We can't automatically clean up all temp files since we don't track them
      // This should be handled by the application or OS temp cleanup
    })
  }
}

/**
 * Create FileManager service instance
 */
export const makeEffectFileManagerService = (): Effect.Effect<EffectFileManagerService, never> =>
  Effect.sync(() => {
    const fileManager = new AudioFileManager()
    return new EffectFileManagerServiceImpl(fileManager)
  })

/**
 * Layer providing Effect FileManager service
 */
export const EffectFileManagerServiceLive: Layer.Layer<EffectFileManagerService, never, never> = Layer.effect(
  EffectFileManagerContext,
  makeEffectFileManagerService()
)

/**
 * Scoped layer that automatically cleans up resources on scope close
 */
export const EffectFileManagerServiceScoped: Layer.Layer<EffectFileManagerService, never, Scope.Scope> = Layer.scoped(
  EffectFileManagerContext,
  Effect.gen(function* () {
    const service = yield* makeEffectFileManagerService()

    // Add finalizer to cleanup resources when scope closes
    yield* Effect.addFinalizer(() => service.cleanup())

    return service
  })
)
