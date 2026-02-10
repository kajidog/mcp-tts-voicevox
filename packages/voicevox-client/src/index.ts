export { VoicevoxClient, type SpeakOptions } from './client.js'
export * from './types.js'
export * from './api.js'
export * from './utils.js'
export * from './error.js'

// queueモジュールから再エクスポート（stateと重複するものを除く）
export {
  QueueService,
  type EnqueueResult,
  type EnqueueOptions,
  AudioFileManager,
  EventManager,
  AudioGenerator,
  QueueEventType,
  type QueueItem,
  type QueueEventListener,
  type QueueManager,
} from './queue/index.js'

// stateモジュールから再エクスポート
export {
  ItemStateMachine,
  QueueStateMachine,
  type QueueEventCallbacks,
  QueueItemStatus,
  QueueState,
  type ItemAction,
  type QueueAction,
  type QueueItemData,
  type QueueStateChangeCallback,
  type StateChangeCallback,
  type StateTransition,
} from './state/index.js'

// playbackモジュールから再エクスポート
export {
  PlaybackService,
  BrowserPlaybackStrategy,
  createPlaybackStrategy,
  type ActivePlayback,
  type AudioSource,
  type PlaybackCallbacks,
  type PlaybackStrategy,
} from './playback/index.js'
