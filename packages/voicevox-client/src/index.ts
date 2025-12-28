export { VoicevoxClient, type SpeakOptions } from './client'
export * from './types'
export * from './api'
export * from './utils'
export * from './error'

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
} from './queue'

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
} from './state'

// playbackモジュールから再エクスポート
export {
  PlaybackService,
  BrowserPlaybackStrategy,
  NodePlaybackStrategy,
  createPlaybackStrategy,
  type ActivePlayback,
  type AudioSource,
  type PlaybackCallbacks,
  type PlaybackStrategy,
} from './playback'
