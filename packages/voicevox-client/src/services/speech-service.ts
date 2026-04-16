import type { VoiceApiClient } from '../api.js'
import { handleError } from '../error.js'
import type { QueueService } from '../queue/queue-service.js'
import type { EnqueueResult } from '../queue/queue-service.js'
import type { AudioQuery, PlaybackOptions, SpeakResult, SpeechSegment } from '../types.js'
import { downloadBlob, isBrowser, splitText } from '../utils.js'

export interface SpeechServiceConfig {
  defaultSpeaker: number
  defaultSpeedScale: number
  defaultVolumeScale?: number
  defaultPitchScale?: number
  defaultPrePhonemeLength?: number
  defaultPostPhonemeLength?: number
  defaultPlaybackOptions: PlaybackOptions
  maxSegmentLength: number
}

export interface SpeechServiceSpeakOptions extends PlaybackOptions {
  speaker?: number
  speedScale?: number
  pitchScale?: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
}

export class SpeechService {
  constructor(
    private readonly api: VoiceApiClient,
    private readonly queueService: QueueService,
    private readonly config: SpeechServiceConfig
  ) {}

  public async speak(
    input: string | string[] | SpeechSegment[],
    options: SpeechServiceSpeakOptions = {}
  ): Promise<SpeakResult> {
    try {
      const speaker = options.speaker ?? this.config.defaultSpeaker
      const speed = options.speedScale ?? this.config.defaultSpeedScale

      const segments = this.normalizeInput(input, speaker)
      if (segments.length === 0) {
        return this.createSpeakResult('error', segments, 'Text is empty')
      }

      const playbackOptions = this.buildPlaybackOptions(options)
      if (playbackOptions.immediate === true) {
        await this.queueService.clearQueue()
      }

      await this.enqueueSegmentsWithPriority(segments, options, speed, playbackOptions)
      return this.createSpeakResult(this.getResultStatus(playbackOptions), segments)
    } catch (error) {
      return this.createSpeakResult('error', [], error instanceof Error ? error.message : String(error))
    }
  }

  public async generateQuery(text: string, speaker?: number, speedScale?: number): Promise<AudioQuery> {
    try {
      const speakerId = this.getSpeakerId(speaker)
      const query = await this.api.generateQuery(text, speakerId)
      query.speedScale = this.getSpeedScale(speedScale)

      if (this.config.defaultVolumeScale !== undefined) {
        query.volumeScale = this.config.defaultVolumeScale
      }
      if (this.config.defaultPitchScale !== undefined) {
        query.pitchScale = this.config.defaultPitchScale
      }
      if (this.config.defaultPrePhonemeLength !== undefined) {
        query.prePhonemeLength = this.config.defaultPrePhonemeLength
      }
      if (this.config.defaultPostPhonemeLength !== undefined) {
        query.postPhonemeLength = this.config.defaultPostPhonemeLength
      }

      return query
    } catch (error) {
      throw handleError('クエリ生成中にエラーが発生しました', error)
    }
  }

  public async generateAudioFile(
    textOrQuery: string | AudioQuery,
    outputPath?: string,
    speaker?: number,
    speedScale?: number
  ): Promise<string> {
    try {
      const speakerId = this.getSpeakerId(speaker)
      const speed = this.getSpeedScale(speedScale)
      const fileManager = this.queueService.getFileManager()

      if (isBrowser()) {
        const filename =
          outputPath ||
          (typeof textOrQuery === 'string'
            ? `voice-${textOrQuery.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.wav`
            : `voice-${Date.now()}.wav`)

        const query =
          typeof textOrQuery === 'string' ? await this.generateQuery(textOrQuery, speakerId) : { ...textOrQuery }
        query.speedScale = speed

        const audioData = await this.api.synthesize(query, speakerId)
        return await downloadBlob(audioData, filename)
      }

      if (typeof textOrQuery === 'string') {
        const query = await this.generateQuery(textOrQuery, speakerId)
        query.speedScale = speed
        const audioData = await this.api.synthesize(query, speakerId)

        if (!outputPath) {
          return await fileManager.saveTempAudioFile(audioData)
        }
        return await fileManager.saveAudioFile(audioData, outputPath)
      }

      const query = { ...textOrQuery, speedScale: speed }
      const audioData = await this.api.synthesize(query, speakerId)

      if (!outputPath) {
        return await fileManager.saveTempAudioFile(audioData)
      }
      return await fileManager.saveAudioFile(audioData, outputPath)
    } catch (error) {
      throw handleError('音声ファイル生成中にエラーが発生しました', error)
    }
  }

  public async enqueueAudioGeneration(
    input: string | string[] | SpeechSegment[] | AudioQuery,
    options: SpeechServiceSpeakOptions = {}
  ): Promise<SpeakResult> {
    try {
      const speed = options.speedScale ?? this.config.defaultSpeedScale
      const playbackOptions = this.buildPlaybackOptions(options)

      if (playbackOptions.immediate === true) {
        await this.queueService.clearQueue()
      }

      if (typeof input === 'object' && !Array.isArray(input) && 'accent_phrases' in input) {
        const speakerId = this.getSpeakerId(options.speaker)
        const query = { ...input }
        this.applyAudioOptions(query, options, speed)
        const { promises } = await this.queueService.enqueueQuery(
          query,
          speakerId,
          {
            ...playbackOptions,
            immediate: false,
          },
          '(クエリ再生)'
        )

        await this.waitForRequestedPromises(playbackOptions, promises)
        return this.createSpeakResult(this.getResultStatus(playbackOptions), [
          { text: '(from query)', speaker: speakerId },
        ])
      }

      const segments = this.normalizeInput(input as string | string[] | SpeechSegment[], options.speaker)
      if (segments.length === 0) {
        return this.createSpeakResult('error', segments, 'Text is empty')
      }

      await this.enqueueSegmentsWithPriority(segments, options, speed, playbackOptions)
      return this.createSpeakResult(this.getResultStatus(playbackOptions), segments)
    } catch (error) {
      return this.createSpeakResult('error', [], error instanceof Error ? error.message : String(error))
    }
  }

  private normalizeInput(input: string | string[] | SpeechSegment[], defaultSpeaker?: number): SpeechSegment[] {
    if (typeof input === 'string') {
      const segments = splitText(input, this.config.maxSegmentLength)
      return segments.map((text) => ({ text, speaker: defaultSpeaker }))
    }

    if (Array.isArray(input)) {
      if (input.length === 0) return []

      if (typeof input[0] === 'object' && 'text' in input[0]) {
        return (input as SpeechSegment[]).map((segment) => ({
          text: segment.text,
          speaker: segment.speaker || defaultSpeaker,
        }))
      }

      return (input as string[]).map((text) => ({ text, speaker: defaultSpeaker }))
    }

    return []
  }

  private getSpeakerId(speaker?: number): number {
    return speaker ?? this.config.defaultSpeaker
  }

  private getSpeedScale(speedScale?: number): number {
    return speedScale ?? this.config.defaultSpeedScale
  }

  private applyAudioOptions(query: AudioQuery, options: SpeechServiceSpeakOptions, speed: number): void {
    query.speedScale = speed
    if (options.pitchScale !== undefined) query.pitchScale = options.pitchScale
    if (options.intonationScale !== undefined) query.intonationScale = options.intonationScale
    if (options.volumeScale !== undefined) query.volumeScale = options.volumeScale
    if (options.prePhonemeLength !== undefined) query.prePhonemeLength = options.prePhonemeLength
    if (options.postPhonemeLength !== undefined) query.postPhonemeLength = options.postPhonemeLength
  }

  private buildPlaybackOptions(options: SpeechServiceSpeakOptions): PlaybackOptions {
    return {
      immediate: options.immediate ?? this.config.defaultPlaybackOptions.immediate,
      waitForStart: options.waitForStart ?? this.config.defaultPlaybackOptions.waitForStart,
      waitForEnd: options.waitForEnd ?? this.config.defaultPlaybackOptions.waitForEnd,
    }
  }

  private getResultStatus(playbackOptions: PlaybackOptions): SpeakResult['status'] {
    return playbackOptions.waitForEnd ? 'played' : 'queued'
  }

  private async waitForRequestedPromises(
    playbackOptions: PlaybackOptions,
    promises: EnqueueResult['promises']
  ): Promise<void> {
    const waitPromises: Array<Promise<void>> = []
    if (playbackOptions.waitForStart && promises.start) waitPromises.push(promises.start)
    if (playbackOptions.waitForEnd && promises.end) waitPromises.push(promises.end)
    if (waitPromises.length > 0) {
      await Promise.all(waitPromises)
    }
  }

  private async enqueueSegmentsWithPriority(
    segments: SpeechSegment[],
    options: SpeechServiceSpeakOptions,
    speed: number,
    playbackOptions: PlaybackOptions
  ): Promise<void> {
    let firstStartPromise: Promise<void> | undefined
    let lastEndPromise: Promise<void> | undefined

    const firstSegment = segments[0]
    const firstSpeakerId = this.getSpeakerId(firstSegment.speaker)
    const firstQuery = await this.generateQuery(firstSegment.text, firstSpeakerId)
    this.applyAudioOptions(firstQuery, options, speed)

    const { promises: firstPromises } = await this.queueService.enqueueQuery(
      firstQuery,
      firstSpeakerId,
      {
        ...playbackOptions,
        immediate: false,
        waitForStart: playbackOptions.waitForStart,
        waitForEnd: playbackOptions.waitForEnd,
      },
      firstSegment.text
    )

    if (firstPromises.start) {
      firstStartPromise = firstPromises.start
    }
    if (firstPromises.end) {
      lastEndPromise = firstPromises.end
    }

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i]
      const speakerId = this.getSpeakerId(segment.speaker)
      const query = await this.generateQuery(segment.text, speakerId)
      this.applyAudioOptions(query, options, speed)

      const isLastSegment = i === segments.length - 1
      const { promises: segmentPromises } = await this.queueService.enqueueQuery(
        query,
        speakerId,
        {
          ...playbackOptions,
          immediate: false,
          waitForStart: false,
          waitForEnd: isLastSegment ? playbackOptions.waitForEnd : false,
        },
        segment.text
      )

      if (isLastSegment && segmentPromises.end) {
        lastEndPromise = segmentPromises.end
      }
    }

    await this.waitForRequestedPromises(playbackOptions, {
      start: firstStartPromise,
      end: lastEndPromise,
    })
  }

  private createSpeakResult(
    status: SpeakResult['status'],
    segments: SpeechSegment[],
    errorMessage?: string
  ): SpeakResult {
    const isStreaming = this.queueService.isStreamingEnabled()
    const textPreview = this.createTextPreview(segments, 30)
    return {
      status,
      mode: isStreaming ? 'streaming' : 'file',
      textPreview,
      segmentCount: segments.length,
      errorMessage,
    }
  }

  private createTextPreview(segments: SpeechSegment[], maxLength: number): string {
    const fullText = segments.map((segment) => segment.text).join(' ')
    if (fullText.length <= maxLength) {
      return fullText
    }
    return `${fullText.substring(0, maxLength - 3)}...`
  }
}
