import type { NormalizedDictionaryWord } from './accent-utils.js'
import { VoicevoxApi } from './api.js'
import { handleError } from './error.js'
import { QueueService } from './queue/queue-service.js'
import { QueueEventType, QueueItemStatus } from './queue/types.js'
import { DictionaryService } from './services/dictionary-service.js'
import type {
  DictionaryWordInput as DictionaryWordInputBase,
  DictionaryWordUpdateInput as DictionaryWordUpdateInputBase,
} from './services/dictionary-service.js'
import { SpeechService } from './services/speech-service.js'
import type { SpeechServiceSpeakOptions } from './services/speech-service.js'
import type { AccentPhrase, AudioQuery, PlaybackOptions, SpeakResult, SpeechSegment, VoicevoxConfig } from './types.js'

/**
 * 話者オプション（統一API用）
 */
export interface SpeakOptions extends SpeechServiceSpeakOptions {}

/**
 * 辞書単語追加入力
 */
export interface DictionaryWordInput extends DictionaryWordInputBase {}

/**
 * 辞書単語更新入力
 */
export interface DictionaryWordUpdateInput extends DictionaryWordUpdateInputBase {}

/**
 * 環境変数から再生オプションを読み取る関数
 */
function getPlaybackOptionsFromEnv(): PlaybackOptions {
  if (typeof process === 'undefined' || !process.env) {
    return {}
  }

  const immediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE
  const waitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START
  const waitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END

  return {
    immediate:
      immediate !== undefined && (immediate === 'true' || immediate === 'false') ? immediate === 'true' : undefined,
    waitForStart:
      waitForStart !== undefined && (waitForStart === 'true' || waitForStart === 'false')
        ? waitForStart === 'true'
        : undefined,
    waitForEnd:
      waitForEnd !== undefined && (waitForEnd === 'true' || waitForEnd === 'false') ? waitForEnd === 'true' : undefined,
  }
}

export class VoicevoxClient {
  private readonly queueService: QueueService
  private readonly api: VoicevoxApi
  private readonly defaultPlaybackOptions: PlaybackOptions
  private readonly dictionaryService: DictionaryService
  private readonly speechService: SpeechService

  constructor(config: VoicevoxConfig) {
    this.validateConfig(config)

    const defaultSpeaker = config.defaultSpeaker ?? 1
    const defaultSpeedScale = config.defaultSpeedScale ?? 1.0

    const envOptions = getPlaybackOptionsFromEnv()
    this.defaultPlaybackOptions = {
      immediate: true,
      waitForStart: false,
      waitForEnd: false,
    }

    if (config.defaultPlaybackOptions) {
      Object.assign(this.defaultPlaybackOptions, config.defaultPlaybackOptions)
    }
    if (envOptions.immediate !== undefined) {
      this.defaultPlaybackOptions.immediate = envOptions.immediate
    }
    if (envOptions.waitForStart !== undefined) {
      this.defaultPlaybackOptions.waitForStart = envOptions.waitForStart
    }
    if (envOptions.waitForEnd !== undefined) {
      this.defaultPlaybackOptions.waitForEnd = envOptions.waitForEnd
    }

    this.api = new VoicevoxApi(config.url, {
      timeout: config.apiTimeout,
      retryCount: config.apiRetryCount,
      retryDelay: config.apiRetryDelay,
    })
    this.queueService = new QueueService(this.api, {
      useStreaming: config.useStreaming,
      prefetchSize: config.prefetchSize,
    })

    this.dictionaryService = new DictionaryService(this.api, defaultSpeaker)
    this.speechService = new SpeechService(this.api, this.queueService, {
      defaultSpeaker,
      defaultSpeedScale,
      defaultVolumeScale: config.defaultVolumeScale,
      defaultPitchScale: config.defaultPitchScale,
      defaultPrePhonemeLength: config.defaultPrePhonemeLength,
      defaultPostPhonemeLength: config.defaultPostPhonemeLength,
      defaultPlaybackOptions: this.defaultPlaybackOptions,
      maxSegmentLength: config.maxSegmentLength ?? 150,
    })

    this.queueService.startPlayback()
    this.queueService.addEventListener(QueueEventType.ERROR, (_, item) => {
      if (item) {
        console.error(`音声合成エラー: ${item.text} (${item.error?.message || '不明なエラー'})`)
      }
    })
  }

  public async speak(input: string | string[] | SpeechSegment[], options: SpeakOptions = {}): Promise<SpeakResult> {
    return this.speechService.speak(input, options)
  }

  public async generateQuery(text: string, speaker?: number, speedScale?: number): Promise<AudioQuery> {
    return this.speechService.generateQuery(text, speaker, speedScale)
  }

  public async generateAudioFile(
    textOrQuery: string | AudioQuery,
    outputPath?: string,
    speaker?: number,
    speedScale?: number
  ): Promise<string> {
    return this.speechService.generateAudioFile(textOrQuery, outputPath, speaker, speedScale)
  }

  public async enqueueAudioGeneration(
    input: string | string[] | SpeechSegment[] | AudioQuery,
    options: SpeakOptions = {}
  ): Promise<SpeakResult> {
    return this.speechService.enqueueAudioGeneration(input, options)
  }

  private validateConfig(config: VoicevoxConfig): void {
    if (!config.url) {
      throw new Error('VOICEVOXのURLが指定されていません')
    }
    try {
      new URL(config.url)
    } catch {
      throw new Error('無効なVOICEVOXのURLです')
    }
    if (config.prefetchSize !== undefined) {
      if (!Number.isInteger(config.prefetchSize) || config.prefetchSize <= 0) {
        throw new Error('prefetchSize は 1 以上の整数で指定してください')
      }
    }
  }

  public async getDictionary(): Promise<NormalizedDictionaryWord[]> {
    return this.dictionaryService.getDictionary()
  }

  public async addDictionaryWord(input: DictionaryWordInput): Promise<NormalizedDictionaryWord[]> {
    return this.dictionaryService.addDictionaryWord(input)
  }

  public async addDictionaryWords(inputs: DictionaryWordInput[]): Promise<NormalizedDictionaryWord[]> {
    return this.dictionaryService.addDictionaryWords(inputs)
  }

  public async updateDictionaryWord(input: DictionaryWordUpdateInput): Promise<NormalizedDictionaryWord[]> {
    return this.dictionaryService.updateDictionaryWord(input)
  }

  public async updateDictionaryWords(inputs: DictionaryWordUpdateInput[]): Promise<NormalizedDictionaryWord[]> {
    return this.dictionaryService.updateDictionaryWords(inputs)
  }

  public async deleteDictionaryWord(wordUuid: string): Promise<NormalizedDictionaryWord[]> {
    return this.dictionaryService.deleteDictionaryWord(wordUuid)
  }

  public async getAccentNotation(
    text: string,
    speaker?: number
  ): Promise<{ notation: string; accentPhrases: AccentPhrase[] }> {
    return this.dictionaryService.getAccentNotation(text, speaker)
  }

  public async clearQueue(): Promise<void> {
    return this.queueService.clearQueue()
  }

  public async getSpeakers() {
    try {
      return await this.api.getSpeakers()
    } catch (error) {
      throw handleError('スピーカー一覧取得中にエラーが発生しました', error)
    }
  }

  public async getSpeakerInfo(uuid: string) {
    try {
      return await this.api.getSpeakerInfo(uuid)
    } catch (error) {
      throw handleError('スピーカー情報取得中にエラーが発生しました', error)
    }
  }

  public async checkHealth(): Promise<{ connected: boolean; version?: string; url: string }> {
    return this.api.checkHealth()
  }

  public getQueueService(): QueueService {
    return this.queueService
  }

  public startPlayback(): void {
    this.queueService.startPlayback()
  }

  public pausePlayback(): void {
    this.queueService.pausePlayback()
  }

  public resumePlayback(): void {
    this.queueService.resumePlayback()
  }

  public getQueueLength(): number {
    return this.queueService.getQueue().length
  }

  public isQueueEmpty(): boolean {
    return this.queueService.getQueue().length === 0
  }

  public isPlaying(): boolean {
    return this.queueService.getQueue().some((item) => item.status === QueueItemStatus.PLAYING)
  }
}
