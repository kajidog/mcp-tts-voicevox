/**
 * Effect Context definitions for dependency injection
 * Provides clean separation of concerns and testable components
 */

import { Context, type Effect } from 'effect'
import type { VoicevoxApi } from '../api'
import type { AudioGenerator } from '../queue/audio-generator'
import type { AudioPlayer } from '../queue/audio-player'
import type { EventManager } from '../queue/event-manager'
import type { AudioFileManager } from '../queue/file-manager'
import type { FileOperationError } from './errors'

/**
 * VOICEVOX API client context
 */
export interface VoicevoxApiService {
  readonly getApi: () => VoicevoxApi
  readonly generateQuery: (text: string, speaker?: number) => Effect.Effect<any, any>
  readonly synthesize: (query: any, speaker?: number) => Effect.Effect<ArrayBuffer, any>
  readonly getSpeakers: () => Effect.Effect<any[], any>
  readonly getSpeakerInfo: (uuid: string) => Effect.Effect<any, any>
}

export const VoicevoxApiContext = Context.GenericTag<VoicevoxApiService>('@voicevox/VoicevoxApi')

/**
 * File management service context
 */
export interface FileManagerService {
  readonly saveTempAudioFile: (audioData: ArrayBuffer) => Promise<string>
  readonly deleteTempFile: (filePath: string) => Promise<void>
  readonly releaseAllBlobUrls: () => void
}

/**
 * Effect-based file management service context
 */
export interface EffectFileManagerService {
  readonly saveTempAudioFile: (audioData: ArrayBuffer) => Effect.Effect<string, FileOperationError>
  readonly saveAudioFile: (
    audioData: ArrayBuffer,
    outputPath: string,
    overwrite?: boolean
  ) => Effect.Effect<string, FileOperationError>
  readonly deleteTempFile: (filePath: string) => Effect.Effect<void, FileOperationError>
  readonly releaseAllBlobUrls: () => Effect.Effect<void, never>
  readonly createTempFilePath: () => Effect.Effect<string, FileOperationError>
  readonly createBlobUrl: (blob: Blob) => Effect.Effect<string, FileOperationError>
  readonly releaseBlobUrl: (url: string) => Effect.Effect<void, never>
  readonly cleanup: () => Effect.Effect<void, never>
}

export const EffectFileManagerContext = Context.GenericTag<EffectFileManagerService>('@voicevox/EffectFileManager')

export const FileManagerContext = Context.GenericTag<FileManagerService>('@voicevox/FileManager')

/**
 * Event management service context
 */
export interface EventManagerService {
  readonly emitEvent: (eventType: string, data?: any) => void
  readonly addEventListener: (eventType: string, listener: (...args: any[]) => void) => void
  readonly removeEventListener: (eventType: string, listener: (...args: any[]) => void) => void
}

export const EventManagerContext = Context.GenericTag<EventManagerService>('@voicevox/EventManager')

/**
 * Audio generation service context
 */
export interface AudioGeneratorService {
  readonly generateQuery: (text: string, speaker: number) => Promise<any>
  readonly generateAudioFromQuery: (item: any, statusCallback: (item: any, status: string) => void) => Promise<void>
  readonly generateAudio: (item: any, statusCallback: (item: any, status: string) => void) => Promise<void>
}

export const AudioGeneratorContext = Context.GenericTag<AudioGeneratorService>('@voicevox/AudioGenerator')

/**
 * Audio playback service context
 */
export interface AudioPlayerService {
  readonly playAudio: (filePath: string) => Promise<void>
}

export const AudioPlayerContext = Context.GenericTag<AudioPlayerService>('@voicevox/AudioPlayer')

/**
 * Queue item definition for Effect system
 */
export interface QueueItemData {
  readonly id: string
  readonly text: string
  readonly speaker: number
  readonly status: string
  readonly createdAt: Date
  readonly query?: any
  readonly tempFile?: string
  readonly error?: Error
  readonly options?: {
    readonly immediate?: boolean
    readonly waitForStart?: boolean
    readonly waitForEnd?: boolean
  }
  readonly playbackPromiseResolvers?: {
    readonly startResolve?: () => void
    readonly endResolve?: () => void
  }
}

/**
 * Queue management service context
 */
export interface QueueManagerService {
  readonly enqueue: (item: QueueItemData) => Promise<QueueItemData>
  readonly dequeue: () => Promise<QueueItemData | null>
  readonly getQueue: () => Promise<readonly QueueItemData[]>
  readonly clearQueue: () => Promise<void>
  readonly removeItem: (itemId: string) => Promise<boolean>
  readonly processQueue: () => Promise<void>
}

export const QueueManagerContext = Context.GenericTag<QueueManagerService>('@voicevox/QueueManager')

/**
 * Combined services context for the complete VOICEVOX system
 */
export interface VoicevoxServices {
  readonly api: VoicevoxApiService
  readonly fileManager: FileManagerService
  readonly eventManager: EventManagerService
  readonly audioGenerator: AudioGeneratorService
  readonly audioPlayer: AudioPlayerService
  readonly queueManager: QueueManagerService
}

export const VoicevoxServicesContext = Context.GenericTag<VoicevoxServices>('@voicevox/Services')
