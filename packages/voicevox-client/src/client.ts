import {
  accentPhrasesToNotation,
  estimateAccentType,
  insertAccentBrackets,
  isKatakana,
  normalizeUserDictionaryWords,
  parseAccentNotation,
} from './accent-utils.js'
import type { NormalizedDictionaryWord } from './accent-utils.js'
import { VoicevoxApi } from './api.js'
import { handleError } from './error.js'
import { QueueService } from './queue/queue-service.js'
import type { EnqueueResult } from './queue/queue-service.js'
import { QueueEventType, QueueItemStatus } from './queue/types.js'
import type { AccentPhrase, AudioQuery, PlaybackOptions, SpeakResult, SpeechSegment, VoicevoxConfig } from './types.js'
import { downloadBlob, isBrowser, splitText } from './utils.js'

/**
 * 話者オプション（統一API用）
 */
export interface SpeakOptions extends PlaybackOptions {
  /** 話者ID */
  speaker?: number
  /** 再生速度 */
  speedScale?: number
  /** 音高 (-0.15 ~ 0.15) */
  pitchScale?: number
  /** 抑揚 (0.0 ~ 2.0) */
  intonationScale?: number
  /** 音量 (0.0 ~ 2.0) */
  volumeScale?: number
  /** 音声の前の無音時間（秒） */
  prePhonemeLength?: number
  /** 音声の後の無音時間（秒） */
  postPhonemeLength?: number
}

/**
 * 辞書単語追加入力
 */
export interface DictionaryWordInput {
  surface: string
  pronunciation: string // "ボイス[ボッ]クス" or "ボイスボックス"
  accentType?: number // 明示指定時は notation parsing をスキップ
  priority?: number // default: 5
  wordType?: string // default: 'PROPER_NOUN'
}

/**
 * 辞書単語更新入力
 */
export interface DictionaryWordUpdateInput {
  wordUuid: string
  surface?: string // 省略で既存値維持
  pronunciation?: string
  accentType?: number
  priority?: number
  wordType?: string
}

/**
 * 環境変数から再生オプションを読み取る関数
 */
function getPlaybackOptionsFromEnv(): PlaybackOptions {
  // ブラウザ環境ではprocess.envが存在しないので空のオブジェクトを返す
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
  private readonly defaultSpeaker: number
  private readonly defaultSpeedScale: number
  private readonly defaultVolumeScale?: number
  private readonly defaultPitchScale?: number
  private readonly defaultPrePhonemeLength?: number
  private readonly defaultPostPhonemeLength?: number
  private readonly defaultPlaybackOptions: PlaybackOptions
  private readonly maxSegmentLength: number

  constructor(config: VoicevoxConfig) {
    this.validateConfig(config)
    this.defaultSpeaker = config.defaultSpeaker ?? 1
    this.defaultSpeedScale = config.defaultSpeedScale ?? 1.0
    this.defaultVolumeScale = config.defaultVolumeScale
    this.defaultPitchScale = config.defaultPitchScale
    this.defaultPrePhonemeLength = config.defaultPrePhonemeLength
    this.defaultPostPhonemeLength = config.defaultPostPhonemeLength

    // 設定から再生オプションを取得し、環境変数でオーバーライド
    const envOptions = getPlaybackOptionsFromEnv()
    this.defaultPlaybackOptions = {
      immediate: true,
      waitForStart: false,
      waitForEnd: false,
    }

    // 設定オブジェクトの値で上書き
    if (config.defaultPlaybackOptions) {
      Object.assign(this.defaultPlaybackOptions, config.defaultPlaybackOptions)
    }

    // 環境変数の値でオーバーライド
    if (envOptions.immediate !== undefined) {
      this.defaultPlaybackOptions.immediate = envOptions.immediate
    }
    if (envOptions.waitForStart !== undefined) {
      this.defaultPlaybackOptions.waitForStart = envOptions.waitForStart
    }
    if (envOptions.waitForEnd !== undefined) {
      this.defaultPlaybackOptions.waitForEnd = envOptions.waitForEnd
    }

    this.maxSegmentLength = config.maxSegmentLength ?? 150
    this.api = new VoicevoxApi(config.url)
    this.queueService = new QueueService(this.api, {
      useStreaming: config.useStreaming,
      prefetchSize: config.prefetchSize,
    })

    // デフォルトで再生を開始
    this.queueService.startPlayback()

    // エラーイベントのログ記録
    this.queueService.addEventListener(QueueEventType.ERROR, (_, item) => {
      if (item) {
        console.error(`音声合成エラー: ${item.text} (${item.error?.message || '不明なエラー'})`)
      }
    })
  }

  /**
   * テキストを音声に変換して再生します（統一API）
   * @param input テキスト、テキスト配列、またはセグメント配列
   * @param options 再生オプション（speaker, speedScale, immediate, waitForStart, waitForEnd）
   * @returns 処理結果
   */
  public async speak(input: string | string[] | SpeechSegment[], options: SpeakOptions = {}): Promise<SpeakResult> {
    try {
      const speaker = options.speaker ?? this.defaultSpeaker
      const speed = options.speedScale ?? this.defaultSpeedScale

      // 入力を統一フォーマットに変換
      const segments = this.normalizeInput(input, speaker)

      if (segments.length === 0) {
        return this.createSpeakResult('error', segments, 'Text is empty')
      }

      const playbackOptions = this.buildPlaybackOptions(options)

      // immediate: true の場合、既存のキューをクリア
      if (playbackOptions.immediate === true) {
        await this.queueService.clearQueue()
      }

      await this.enqueueSegmentsWithPriority(segments, options, speed, playbackOptions)

      return this.createSpeakResult(this.getResultStatus(playbackOptions), segments)
    } catch (error) {
      return this.createSpeakResult('error', [], error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * 入力を統一フォーマット（SpeechSegment[]）に変換
   * @private
   */
  private normalizeInput(input: string | string[] | SpeechSegment[], defaultSpeaker?: number): SpeechSegment[] {
    if (typeof input === 'string') {
      // 文字列の場合は分割してセグメント化
      const segments = splitText(input, this.maxSegmentLength)
      return segments.map((text) => ({
        text,
        speaker: defaultSpeaker,
      }))
    }

    if (Array.isArray(input)) {
      // 配列の場合
      if (input.length === 0) return []

      // SpeechSegment配列かどうかチェック
      if (typeof input[0] === 'object' && 'text' in input[0]) {
        // SpeechSegment配列の場合
        return (input as SpeechSegment[]).map((segment) => ({
          text: segment.text,
          speaker: segment.speaker || defaultSpeaker,
        }))
      }
      // 文字列配列の場合
      return (input as string[]).map((text) => ({
        text,
        speaker: defaultSpeaker,
      }))
    }

    return []
  }

  /**
   * テキストから音声合成用クエリを生成します
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 音声合成用クエリ
   */
  public async generateQuery(text: string, speaker?: number, speedScale?: number): Promise<AudioQuery> {
    try {
      const speakerId = this.getSpeakerId(speaker)
      // 直接APIを使用してクエリを生成
      const query = await this.api.generateQuery(text, speakerId)
      query.speedScale = this.getSpeedScale(speedScale)

      // デフォルト値を適用
      if (this.defaultVolumeScale !== undefined) {
        query.volumeScale = this.defaultVolumeScale
      }
      if (this.defaultPitchScale !== undefined) {
        query.pitchScale = this.defaultPitchScale
      }
      if (this.defaultPrePhonemeLength !== undefined) {
        query.prePhonemeLength = this.defaultPrePhonemeLength
      }
      if (this.defaultPostPhonemeLength !== undefined) {
        query.postPhonemeLength = this.defaultPostPhonemeLength
      }

      return query
    } catch (error) {
      throw handleError('クエリ生成中にエラーが発生しました', error)
    }
  }

  /**
   * テキストから直接音声ファイルを生成します
   * @param textOrQuery テキストまたは音声合成用クエリ
   * @param outputPath 出力ファイルパス（オプション、省略時は一時ファイル）
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 生成した音声ファイルのパス
   */
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

      // ブラウザ環境の場合
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

      // Node.js環境の場合
      if (typeof textOrQuery === 'string') {
        const query = await this.generateQuery(textOrQuery, speakerId)
        query.speedScale = speed
        const audioData = await this.api.synthesize(query, speakerId)

        if (!outputPath) {
          return await fileManager.saveTempAudioFile(audioData)
        }
        return await fileManager.saveAudioFile(audioData, outputPath)
      }

      // クエリを使って音声合成
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

  /**
   * テキストを音声ファイル生成キューに追加します（統一API）
   * @param input テキスト、テキスト配列、セグメント配列、またはAudioQuery
   * @param options 再生オプション
   * @returns 処理結果
   */
  public async enqueueAudioGeneration(
    input: string | string[] | SpeechSegment[] | AudioQuery,
    options: SpeakOptions = {}
  ): Promise<SpeakResult> {
    try {
      const speed = options.speedScale ?? this.defaultSpeedScale

      const playbackOptions = this.buildPlaybackOptions(options)

      // immediate: true の場合、既存のキューをクリア
      if (playbackOptions.immediate === true) {
        await this.queueService.clearQueue()
      }

      // AudioQueryの場合（単一アイテム）
      if (typeof input === 'object' && !Array.isArray(input) && 'accent_phrases' in input) {
        const speakerId = this.getSpeakerId(options.speaker)
        const query = { ...input }
        this.applyAudioOptions(query, options, speed)
        const { promises } = await this.queueService.enqueueQuery(
          query,
          speakerId,
          {
            ...playbackOptions,
            immediate: false, // キューは既にクリア済み
          },
          '(クエリ再生)' // クエリの場合はテキストがないのでプレースホルダー
        )

        await this.waitForRequestedPromises(playbackOptions, promises)

        return this.createSpeakResult(this.getResultStatus(playbackOptions), [
          { text: '(from query)', speaker: speakerId },
        ])
      }

      // テキスト系の場合
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

  /**
   * 話者IDを取得（指定がない場合はデフォルト値を使用）
   * @private
   */
  private getSpeakerId(speaker?: number): number {
    return speaker ?? this.defaultSpeaker
  }

  /**
   * 再生速度を取得（指定がない場合はデフォルト値を使用）
   * @private
   */
  private getSpeedScale(speedScale?: number): number {
    return speedScale ?? this.defaultSpeedScale
  }

  /**
   * AudioQueryにSpeakOptionsの音声パラメータを適用
   * @private
   */
  private applyAudioOptions(query: AudioQuery, options: SpeakOptions, speed: number): void {
    query.speedScale = speed
    if (options.pitchScale !== undefined) query.pitchScale = options.pitchScale
    if (options.intonationScale !== undefined) query.intonationScale = options.intonationScale
    if (options.volumeScale !== undefined) query.volumeScale = options.volumeScale
    if (options.prePhonemeLength !== undefined) query.prePhonemeLength = options.prePhonemeLength
    if (options.postPhonemeLength !== undefined) query.postPhonemeLength = options.postPhonemeLength
  }

  private buildPlaybackOptions(options: SpeakOptions): PlaybackOptions {
    return {
      immediate: options.immediate ?? this.defaultPlaybackOptions.immediate,
      waitForStart: options.waitForStart ?? this.defaultPlaybackOptions.waitForStart,
      waitForEnd: options.waitForEnd ?? this.defaultPlaybackOptions.waitForEnd,
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
    options: SpeakOptions,
    speed: number,
    playbackOptions: PlaybackOptions
  ): Promise<void> {
    let firstStartPromise: Promise<void> | undefined
    let lastEndPromise: Promise<void> | undefined

    // 最初のセグメントを優先的に処理して再生を早く開始
    const firstSegment = segments[0]
    const firstSpeakerId = this.getSpeakerId(firstSegment.speaker)
    const firstQuery = await this.generateQuery(firstSegment.text, firstSpeakerId)
    this.applyAudioOptions(firstQuery, options, speed)

    const { promises: firstPromises } = await this.queueService.enqueueQuery(
      firstQuery,
      firstSpeakerId,
      {
        ...playbackOptions,
        immediate: false, // キューは既にクリア済みなので、通常のキュー処理を行う
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

  /**
   * SpeakResultを生成
   * @private
   */
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

  /**
   * テキストプレビューを生成
   * @private
   */
  private createTextPreview(segments: SpeechSegment[], maxLength: number): string {
    const fullText = segments.map((s) => s.text).join(' ')
    if (fullText.length <= maxLength) {
      return fullText
    }
    return `${fullText.substring(0, maxLength - 3)}...`
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

  // ---------------------------------------------------------------------------
  // Dictionary API
  // ---------------------------------------------------------------------------

  /**
   * ユーザー辞書を取得（notation 付き）
   */
  public async getDictionary(): Promise<NormalizedDictionaryWord[]> {
    try {
      const dictionary = await this.api.getUserDictionary()
      return normalizeUserDictionaryWords(dictionary)
    } catch (error) {
      throw handleError('辞書取得中にエラーが発生しました', error)
    }
  }

  /**
   * 辞書単語を追加し、追加後の全辞書を返す
   */
  public async addDictionaryWord(input: DictionaryWordInput): Promise<NormalizedDictionaryWord[]> {
    try {
      const { pronunciation, accentType } = this.resolvePronunciation(input.pronunciation, input.accentType)
      const surface = input.surface.trim()
      if (!surface) throw new Error('surface is required')

      await this.api.addUserDictionaryWord({
        surface,
        pronunciation,
        accentType,
        priority: input.priority ?? 5,
        wordType: input.wordType,
      })

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語追加中にエラーが発生しました', error)
    }
  }

  /**
   * 複数の辞書単語をバルク追加し、追加後の全辞書を返す
   */
  public async addDictionaryWords(inputs: DictionaryWordInput[]): Promise<NormalizedDictionaryWord[]> {
    try {
      for (const input of inputs) {
        const { pronunciation, accentType } = this.resolvePronunciation(input.pronunciation, input.accentType)
        const surface = input.surface.trim()
        if (!surface) throw new Error('surface is required')

        await this.api.addUserDictionaryWord({
          surface,
          pronunciation,
          accentType,
          priority: input.priority ?? 5,
          wordType: input.wordType,
        })
      }

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語バルク追加中にエラーが発生しました', error)
    }
  }

  /**
   * 辞書単語を更新し、更新後の全辞書を返す。省略フィールドは既存値を維持。
   */
  public async updateDictionaryWord(input: DictionaryWordUpdateInput): Promise<NormalizedDictionaryWord[]> {
    try {
      const wordUuid = input.wordUuid.trim()
      if (!wordUuid) throw new Error('wordUuid is required')

      const dictionary = await this.api.getUserDictionary()
      const existing = dictionary[wordUuid]
      if (!existing) throw new Error(`Word not found: ${wordUuid}`)

      const effectiveSurface = input.surface?.trim() || existing.surface
      const effectivePriority = input.priority ?? existing.priority

      let effectivePronunciation: string
      let effectiveAccentType: number
      if (input.pronunciation?.trim()) {
        const resolved = this.resolvePronunciation(input.pronunciation, input.accentType)
        effectivePronunciation = resolved.pronunciation
        effectiveAccentType = resolved.accentType
      } else if (input.accentType !== undefined) {
        effectivePronunciation = existing.pronunciation
        effectiveAccentType = input.accentType
      } else {
        effectivePronunciation = existing.pronunciation
        effectiveAccentType = existing.accent_type
      }

      await this.api.updateUserDictionaryWord({
        wordUuid,
        surface: effectiveSurface,
        pronunciation: effectivePronunciation,
        accentType: effectiveAccentType,
        priority: effectivePriority,
        wordType: input.wordType,
      })

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語更新中にエラーが発生しました', error)
    }
  }

  /**
   * 複数の辞書単語をバルク更新し、更新後の全辞書を返す
   */
  public async updateDictionaryWords(inputs: DictionaryWordUpdateInput[]): Promise<NormalizedDictionaryWord[]> {
    try {
      // 事前に辞書を一括取得してマージに使う
      const dictionary = await this.api.getUserDictionary()

      for (const input of inputs) {
        const wordUuid = input.wordUuid.trim()
        if (!wordUuid) throw new Error('wordUuid is required')

        const existing = dictionary[wordUuid]
        if (!existing) throw new Error(`Word not found: ${wordUuid}`)

        const effectiveSurface = input.surface?.trim() || existing.surface
        const effectivePriority = input.priority ?? existing.priority

        let effectivePronunciation: string
        let effectiveAccentType: number
        if (input.pronunciation?.trim()) {
          const resolved = this.resolvePronunciation(input.pronunciation, input.accentType)
          effectivePronunciation = resolved.pronunciation
          effectiveAccentType = resolved.accentType
        } else if (input.accentType !== undefined) {
          effectivePronunciation = existing.pronunciation
          effectiveAccentType = input.accentType
        } else {
          effectivePronunciation = existing.pronunciation
          effectiveAccentType = existing.accent_type
        }

        await this.api.updateUserDictionaryWord({
          wordUuid,
          surface: effectiveSurface,
          pronunciation: effectivePronunciation,
          accentType: effectiveAccentType,
          priority: effectivePriority,
          wordType: input.wordType,
        })
      }

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語バルク更新中にエラーが発生しました', error)
    }
  }

  /**
   * 辞書単語を削除し、削除後の全辞書を返す
   */
  public async deleteDictionaryWord(wordUuid: string): Promise<NormalizedDictionaryWord[]> {
    try {
      const normalizedUuid = wordUuid.trim()
      if (!normalizedUuid) throw new Error('wordUuid is required')

      await this.api.deleteUserDictionaryWord(normalizedUuid)
      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語削除中にエラーが発生しました', error)
    }
  }

  /**
   * テキストからアクセント表記を取得
   * @returns notation ("コン[ニ]チワ,セ[カ]イ") と accentPhrases
   */
  public async getAccentNotation(
    text: string,
    speaker?: number
  ): Promise<{ notation: string; accentPhrases: AccentPhrase[] }> {
    try {
      const normalizedText = text.trim()
      if (!normalizedText) throw new Error('text is required')
      const effectiveSpeaker = speaker ?? this.defaultSpeaker
      const accentPhrases = await this.api.getAccentPhrases(normalizedText, effectiveSpeaker)
      const notation = accentPhrasesToNotation(accentPhrases)
      return { notation, accentPhrases }
    } catch (error) {
      throw handleError('アクセント表記取得中にエラーが発生しました', error)
    }
  }

  /**
   * pronunciation 入力を解決する。
   * 1. accentType 明示 → brackets 除去 + isKatakana 検証
   * 2. [ を含む → parseAccentNotation() でパース
   * 3. plain → isKatakana() 検証 + estimateAccentType()
   * @private
   */
  private resolvePronunciation(input: string, accentType?: number): { pronunciation: string; accentType: number } {
    const trimmed = input.trim()
    if (!trimmed) throw new Error('pronunciation is required')

    if (accentType !== undefined) {
      // brackets を除去して純カタカナに
      const clean = trimmed.replace(/\[|\]/g, '')
      if (!isKatakana(clean)) throw new Error('pronunciation must be Katakana')
      return { pronunciation: clean, accentType }
    }

    if (trimmed.includes('[')) {
      const result = parseAccentNotation(trimmed)
      if (!isKatakana(result.pronunciation)) throw new Error('pronunciation must be Katakana')
      return result
    }

    if (!isKatakana(trimmed)) throw new Error('pronunciation must be Katakana')
    return { pronunciation: trimmed, accentType: estimateAccentType(trimmed) }
  }

  /**
   * キューをクリア
   */
  public async clearQueue(): Promise<void> {
    return this.queueService.clearQueue()
  }

  /**
   * スピーカー一覧を取得します
   * @returns スピーカー情報の配列
   */
  public async getSpeakers() {
    try {
      return await this.api.getSpeakers()
    } catch (error) {
      throw handleError('スピーカー一覧取得中にエラーが発生しました', error)
    }
  }

  /**
   * スピーカーの情報を取得
   * @param uuid スピーカーUUID
   * @returns スピーカー情報
   */
  public async getSpeakerInfo(uuid: string) {
    try {
      return await this.api.getSpeakerInfo(uuid)
    } catch (error) {
      throw handleError('スピーカー情報取得中にエラーが発生しました', error)
    }
  }

  /**
   * VOICEVOX Engine の接続状態をチェック
   * @returns 接続情報（connected, version, url）
   */
  public async checkHealth(): Promise<{ connected: boolean; version?: string; url: string }> {
    return this.api.checkHealth()
  }

  /**
   * QueueServiceインスタンスを取得
   * 高度な操作のため公開
   */
  public getQueueService(): QueueService {
    return this.queueService
  }

  /**
   * 再生を開始
   */
  public startPlayback(): void {
    this.queueService.startPlayback()
  }

  /**
   * 再生を一時停止
   */
  public pausePlayback(): void {
    this.queueService.pausePlayback()
  }

  /**
   * 再生を再開
   */
  public resumePlayback(): void {
    this.queueService.resumePlayback()
  }

  /**
   * キュー内のアイテム数を取得
   */
  public getQueueLength(): number {
    return this.queueService.getQueue().length
  }

  /**
   * キューが空かどうかを確認
   */
  public isQueueEmpty(): boolean {
    return this.queueService.getQueue().length === 0
  }

  /**
   * キューが再生中かどうかを確認
   */
  public isPlaying(): boolean {
    return this.queueService.getQueue().some((item) => item.status === QueueItemStatus.PLAYING)
  }
}
