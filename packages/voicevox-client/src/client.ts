import { VoicevoxApi } from './api'
import { formatError, handleError } from './error'
import { QueueService } from './queue/queue-service'
import { QueueEventType, QueueItemStatus } from './queue/types'
import type { AudioQuery, PlaybackOptions, SpeakResult, SpeechSegment, VoicevoxConfig } from './types'
import { downloadBlob, isBrowser, splitText } from './utils'

/**
 * 話者オプション（統一API用）
 */
export interface SpeakOptions extends PlaybackOptions {
  /** 話者ID */
  speaker?: number
  /** 再生速度 */
  speedScale?: number
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

      // 再生オプションをマージ（undefined の場合はデフォルト値を使用）
      const playbackOptions: PlaybackOptions = {
        immediate: options.immediate ?? this.defaultPlaybackOptions.immediate,
        waitForStart: options.waitForStart ?? this.defaultPlaybackOptions.waitForStart,
        waitForEnd: options.waitForEnd ?? this.defaultPlaybackOptions.waitForEnd,
      }

      // immediate: true の場合、既存のキューをクリア
      if (playbackOptions.immediate === true) {
        await this.queueService.clearQueue()
      }

      // 待機用のPromise
      let firstStartPromise: Promise<void> | undefined
      let lastEndPromise: Promise<void> | undefined

      // 最初のセグメントを優先的に処理して再生を早く開始
      if (segments.length > 0) {
        const firstSegment = segments[0]
        const speakerId = this.getSpeakerId(firstSegment.speaker)
        const firstQuery = await this.generateQuery(firstSegment.text, speakerId)
        firstQuery.speedScale = speed

        const { promises: firstPromises } = await this.queueService.enqueueQuery(firstQuery, speakerId, {
          ...playbackOptions,
          immediate: false, // キューは既にクリア済みなので、通常のキュー処理を行う
          waitForStart: playbackOptions.waitForStart,
          waitForEnd: playbackOptions.waitForEnd,
        })

        // waitForStart: 最初のセグメントの開始を待つ
        if (firstPromises.start) {
          firstStartPromise = firstPromises.start
        }
        // セグメントが1つだけの場合は最後のendもこれ
        if (firstPromises.end) {
          lastEndPromise = firstPromises.end
        }
      }

      // 残りのセグメントを順番に処理
      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i]
        const speakerId = this.getSpeakerId(segment.speaker)
        const query = await this.generateQuery(segment.text, speakerId)
        query.speedScale = speed

        const isLastSegment = i === segments.length - 1

        const { promises: segmentPromises } = await this.queueService.enqueueQuery(query, speakerId, {
          ...playbackOptions,
          immediate: false,
          waitForStart: false, // 残りのセグメントの開始は待たない
          waitForEnd: isLastSegment ? playbackOptions.waitForEnd : false, // 最後のセグメントのみ終了を待つ
        })

        // waitForEnd: 最後のセグメントの終了を待つ
        if (isLastSegment && segmentPromises.end) {
          lastEndPromise = segmentPromises.end
        }
      }

      // 待機オプションに応じて処理
      const waitPromises: Array<Promise<void>> = []

      // waitForStart: 最初のセグメントの再生開始を待つ
      if (playbackOptions.waitForStart && firstStartPromise) {
        waitPromises.push(firstStartPromise)
      }

      // waitForEnd: 最後のセグメントの再生終了を待つ
      if (playbackOptions.waitForEnd && lastEndPromise) {
        waitPromises.push(lastEndPromise)
      }

      if (waitPromises.length > 0) {
        await Promise.all(waitPromises)
      }

      const status = playbackOptions.waitForEnd ? 'played' : 'queued'
      return this.createSpeakResult(status, segments)
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

      // 再生オプションをマージ（undefined の場合はデフォルト値を使用）
      const playbackOptions: PlaybackOptions = {
        immediate: options.immediate ?? this.defaultPlaybackOptions.immediate,
        waitForStart: options.waitForStart ?? this.defaultPlaybackOptions.waitForStart,
        waitForEnd: options.waitForEnd ?? this.defaultPlaybackOptions.waitForEnd,
      }

      // immediate: true の場合、既存のキューをクリア
      if (playbackOptions.immediate === true) {
        await this.queueService.clearQueue()
      }

      // AudioQueryの場合（単一アイテム）
      if (typeof input === 'object' && !Array.isArray(input) && 'accent_phrases' in input) {
        const speakerId = this.getSpeakerId(options.speaker)
        const query = { ...input, speedScale: speed }
        const { promises } = await this.queueService.enqueueQuery(query, speakerId, {
          ...playbackOptions,
          immediate: false, // キューは既にクリア済み
        })

        const waitPromises: Array<Promise<void>> = []
        if (playbackOptions.waitForStart && promises.start) waitPromises.push(promises.start)
        if (playbackOptions.waitForEnd && promises.end) waitPromises.push(promises.end)
        if (waitPromises.length > 0) {
          await Promise.all(waitPromises)
        }

        const status = playbackOptions.waitForEnd ? 'played' : 'queued'
        return this.createSpeakResult(status, [{ text: '(from query)', speaker: speakerId }])
      }

      // テキスト系の場合
      const segments = this.normalizeInput(input as string | string[] | SpeechSegment[], options.speaker)

      if (segments.length === 0) {
        return this.createSpeakResult('error', segments, 'Text is empty')
      }

      // 待機用のPromise
      let firstStartPromise: Promise<void> | undefined
      let lastEndPromise: Promise<void> | undefined

      // 最初のセグメントを優先処理
      if (segments.length > 0) {
        const firstSegment = segments[0]
        const speakerId = this.getSpeakerId(firstSegment.speaker)
        const firstQuery = await this.generateQuery(firstSegment.text, speakerId)
        firstQuery.speedScale = speed

        const { promises: firstPromises } = await this.queueService.enqueueQuery(firstQuery, speakerId, {
          ...playbackOptions,
          immediate: false, // キューは既にクリア済み
          waitForStart: playbackOptions.waitForStart,
          waitForEnd: playbackOptions.waitForEnd,
        })

        // waitForStart: 最初のセグメントの開始を待つ
        if (firstPromises.start) {
          firstStartPromise = firstPromises.start
        }
        // セグメントが1つだけの場合は最後のendもこれ
        if (firstPromises.end) {
          lastEndPromise = firstPromises.end
        }
      }

      // 残りのセグメントを順番に処理
      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i]
        const speakerId = this.getSpeakerId(segment.speaker)
        const query = await this.generateQuery(segment.text, speakerId)
        query.speedScale = speed

        const isLastSegment = i === segments.length - 1

        const { promises: segmentPromises } = await this.queueService.enqueueQuery(query, speakerId, {
          ...playbackOptions,
          immediate: false,
          waitForStart: false, // 残りのセグメントの開始は待たない
          waitForEnd: isLastSegment ? playbackOptions.waitForEnd : false, // 最後のセグメントのみ終了を待つ
        })

        // waitForEnd: 最後のセグメントの終了を待つ
        if (isLastSegment && segmentPromises.end) {
          lastEndPromise = segmentPromises.end
        }
      }

      // 待機オプションに応じて処理
      const waitPromises: Array<Promise<void>> = []

      // waitForStart: 最初のセグメントの再生開始を待つ
      if (playbackOptions.waitForStart && firstStartPromise) {
        waitPromises.push(firstStartPromise)
      }

      // waitForEnd: 最後のセグメントの再生終了を待つ
      if (playbackOptions.waitForEnd && lastEndPromise) {
        waitPromises.push(lastEndPromise)
      }

      if (waitPromises.length > 0) {
        await Promise.all(waitPromises)
      }

      const status = playbackOptions.waitForEnd ? 'played' : 'queued'
      return this.createSpeakResult(status, segments)
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
