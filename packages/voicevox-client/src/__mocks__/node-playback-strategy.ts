/**
 * Mock for node-playback-strategy.ts
 * Used in tests to prevent loading Node.js-specific modules
 */
import type { PlaybackStrategy } from '../playback/types.js'

export class NodePlaybackStrategy implements PlaybackStrategy {
  supportsStreaming(): boolean {
    return false
  }

  async playFromBuffer(_data: ArrayBuffer, _signal?: AbortSignal): Promise<void> {
    // Mock implementation - do nothing
  }

  async playFromFile(_filePath: string, _signal?: AbortSignal): Promise<void> {
    // Mock implementation - do nothing
  }

  stop(): void {
    // Mock implementation - do nothing
  }
}
