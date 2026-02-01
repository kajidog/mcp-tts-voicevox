/**
 * Empty module for browser builds
 * Used to replace Node.js-specific modules that are not needed in browser
 */
export class NodePlaybackStrategy {
  supportsStreaming() {
    return false
  }
  async playFromBuffer() {}
  async playFromFile() {}
  stop() {}
}
