export * from './accent-utils.js'
export * from './api.js'
export * from './cache-policy.js'
export {
  type DictionaryWordInput,
  type DictionaryWordUpdateInput,
  type SpeakOptions,
  VoicevoxClient,
} from './client.js'
export * from './error.js'
// playbackモジュールから再エクスポート
export {
  type ActivePlayback,
  type AudioSource,
  BrowserPlaybackStrategy,
  createPlaybackStrategy,
  type PlaybackCallbacks,
  PlaybackService,
  type PlaybackStrategy,
} from './playback/index.js'
// queueモジュールから再エクスポート（stateと重複するものを除く）
export {
  AudioFileManager,
  AudioGenerator,
  type EnqueueOptions,
  type EnqueueResult,
  EventManager,
  type QueueEventListener,
  QueueEventType,
  type QueueItem,
  type QueueManager,
  QueueService,
} from './queue/index.js'
// stateモジュールから再エクスポート
export {
  type ItemAction,
  ItemStateMachine,
  type QueueAction,
  type QueueEventCallbacks,
  type QueueItemData,
  QueueItemStatus,
  QueueState,
  type QueueStateChangeCallback,
  QueueStateMachine,
  type StateChangeCallback,
  type StateTransition,
} from './state/index.js'
export * from './types.js'
export * from './utils.js'
