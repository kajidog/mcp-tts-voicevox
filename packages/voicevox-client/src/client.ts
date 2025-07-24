import type { Effect } from 'effect'
import { VoicevoxApi } from './api'
import { formatError, handleError } from './error'
import { VoicevoxPlayer } from './player'
import type { AudioQuery, PlaybackOptions, SpeechSegment, VoicevoxConfig } from './types'
import { downloadBlob, isBrowser, splitText } from './utils'

// Effect imports (for optional Effect-based APIs)
import { type VoicevoxEffectError, fromPromise } from './effect'

/**
 * 環境変数から再生オプションを読み取る関数
 */
function getPlaybackOptionsFromEnv(): PlaybackOptions {
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

/**
 * VoicevoxClient - Complete VOICEVOX text-to-speech client
 * Provides both traditional Promise-based APIs and optional Effect-based APIs
 */
export class VoicevoxClient {
  private readonly player: VoicevoxPlayer
  private readonly api: VoicevoxApi
  private readonly defaultSpeaker: number
  private readonly defaultSpeedScale: number
  private readonly defaultPlaybackOptions: PlaybackOptions
  private readonly maxSegmentLength: number

  constructor(config: VoicevoxConfig) {
    this.validateConfig(config)
    this.defaultSpeaker = config.defaultSpeaker ?? 1
    this.defaultSpeedScale = config.defaultSpeedScale ?? 1.0

    // 設定から再生オプションを取得し、環境変数でオーバーライド
    const envOptions = getPlaybackOptionsFromEnv()
    this.defaultPlaybackOptions = {
      immediate: true, // デフォルト値
      waitForStart: false, // デフォルト値
      waitForEnd: false, // デフォルト値
    }

    // 設定オブジェクトの値で上書き
    if (config.defaultPlaybackOptions) {
      Object.assign(this.defaultPlaybackOptions, config.defaultPlaybackOptions)
    }

    // 環境変数の値でオーバーライド（undefinedでない場合のみ）
    if (envOptions.immediate !== undefined) {
      this.defaultPlaybackOptions.immediate = envOptions.immediate
    }
    if (envOptions.waitForStart !== undefined) {
      this.defaultPlaybackOptions.waitForStart = envOptions.waitForStart
    }
    if (envOptions.waitForEnd !== undefined) {
      this.defaultPlaybackOptions.waitForEnd = envOptions.waitForEnd
    }

    this.maxSegmentLength = 150
    this.api = new VoicevoxApi(config.url)
    this.player = new VoicevoxPlayer(config.url)
  }

  // ========================================
  // Core Promise-based API (primary)
  // ========================================

  /**
   * テキストを音声に変換して再生します
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async speak(text: string, speaker?: number, speedScale?: number): Promise<string>

  /**
   * テキスト配列を音声に変換して再生します
   * @param texts 変換するテキストの配列
   * @param speaker 話者ID（オプション、全体のデフォルト）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async speak(texts: string[], speaker?: number, speedScale?: number): Promise<string>

  /**
   * テキストと話者のペア配列を音声に変換して再生します
   * @param segments テキストと話者のペア配列
   * @param defaultSpeaker デフォルト話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async speak(segments: SpeechSegment[], defaultSpeaker?: number, speedScale?: number): Promise<string>

  /**
   * テキストを音声に変換して再生します（オプション付き）
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async speak(text: string, speaker?: number, speedScale?: number, options?: PlaybackOptions): Promise<string>

  /**
   * テキスト配列を音声に変換して再生します（オプション付き）
   * @param texts 変換するテキストの配列
   * @param speaker 話者ID（オプション、全体のデフォルト）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async speak(texts: string[], speaker?: number, speedScale?: number, options?: PlaybackOptions): Promise<string>

  /**
   * テキストと話者のペア配列を音声に変換して再生します（オプション付き）
   * @param segments テキストと話者のペア配列
   * @param defaultSpeaker デフォルト話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async speak(
    segments: SpeechSegment[],
    defaultSpeaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>

  // Implementation
  public async speak(
    input: string | string[] | SpeechSegment[],
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string> {
    try {
      const speed = this.getSpeedScale(speedScale)
      const queueManager = this.player.getQueueManager()

      // 入力を統一フォーマットに変換
      const segments = this.normalizeInput(input, speaker)

      if (segments.length === 0) {
        return 'テキストが空です'
      }

      const promises: Array<Promise<void>> = []

      // 最初のセグメントを優先的に処理して再生を早く開始
      if (segments.length > 0) {
        const firstSegment = segments[0]
        const speakerId = this.getSpeakerId(firstSegment.speaker)
        const firstQuery = await this.generateQuery(firstSegment.text, speakerId)
        firstQuery.speedScale = speed

        const { promises: firstPromises } = await queueManager.enqueueQueryWithOptions(firstQuery, speakerId, {
          ...this.defaultPlaybackOptions,
          ...options,
        })

        if (firstPromises.start) promises.push(firstPromises.start)
        if (firstPromises.end) promises.push(firstPromises.end)
      }

      // 残りのセグメントを同期的に処理（プリフェッチのため）
      if (segments.length > 1) {
        for (let i = 1; i < segments.length; i++) {
          const segment = segments[i]
          const speakerId = this.getSpeakerId(segment.speaker)
          const query = await this.generateQuery(segment.text, speakerId)
          query.speedScale = speed

          const { promises: segmentPromises } = await queueManager.enqueueQueryWithOptions(
            query,
            speakerId,
            { ...options, immediate: false } // 最初以外は自動再生しない
          )

          if (segmentPromises.start) promises.push(segmentPromises.start)
          if (segmentPromises.end) promises.push(segmentPromises.end)
        }
      }

      // 待機オプションに応じて処理
      if (promises.length > 0) {
        await Promise.all(promises)
      }

      const textSummary = segments.map((s) => s.text).join(' ')
      return `音声生成キューに追加しました: ${textSummary}`
    } catch (error) {
      return formatError('音声生成中にエラーが発生しました', error)
    }
  }

  /**
   * テキストを音声に変換して再生します（オプション付き）
   * @param text 変換するテキスト
   * @param options 再生オプション
   * @returns 音声再生のPromise
   */
  public async speakWithOptions(
    text: string,
    options?: PlaybackOptions & { speaker?: number; speedScale?: number }
  ): Promise<{ promises: { start?: Promise<void>; end?: Promise<void> } }> {
    try {
      const speaker = options?.speaker ?? this.defaultSpeaker
      const speedScale = options?.speedScale ?? this.defaultSpeedScale

      // オプションから speaker と speedScale を除外
      const playbackOptions: PlaybackOptions = {
        immediate: options?.immediate,
        waitForStart: options?.waitForStart,
        waitForEnd: options?.waitForEnd,
      }

      // 音声クエリを生成
      const query = await this.generateQuery(text, speaker, speedScale)

      // オプション付きでキューに追加
      const result = await this.player.enqueueQueryWithOptions(query, speaker, playbackOptions)

      return { promises: result.promises }
    } catch (error) {
      throw handleError('音声生成中にエラーが発生しました', error)
    }
  }

  /**
   * 音声クエリを生成します
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 音声クエリ
   */
  public async generateQuery(text: string, speaker?: number, speedScale?: number): Promise<AudioQuery> {
    try {
      const speakerId = this.getSpeakerId(speaker)
      // 直接APIを使用してクエリを生成
      const query = await this.api.generateQuery(text, speakerId)
      query.speedScale = this.getSpeedScale(speedScale)
      return query
    } catch (error) {
      throw handleError('クエリ生成中にエラーが発生しました', error)
    }
  }

  /**
   * 音声ファイルを生成します
   * @param text 変換するテキスト
   * @param output 出力先パス
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 生成されたファイルのパス
   */
  public async generateAudioFile(text: string, output: string, speaker?: number, speedScale?: number): Promise<string> {
    try {
      const speakerId = this.getSpeakerId(speaker)
      const speed = this.getSpeedScale(speedScale)

      // ブラウザ環境の場合
      if (isBrowser()) {
        // デフォルトのファイル名を設定
        const filename =
          output || `audio_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}_speaker${speakerId}.wav`

        // 音声クエリを作成
        const query = await this.generateQuery(text, speakerId, speed)

        // 音声データを合成
        const audioData = await this.api.synthesize(query, speakerId)

        // Blobとしてダウンロード
        const blob = new Blob([audioData], { type: 'audio/wav' })
        const url = await downloadBlob(blob, filename)

        return `音声ファイルをダウンロードしました: ${filename}`
      }

      // Node.js環境の場合
      const query = await this.generateQuery(text, speakerId, speed)
      const filePath = await this.player.synthesizeToFile(query, output, speakerId)
      return filePath
    } catch (error) {
      throw handleError('音声ファイルの生成中にエラーが発生しました', error)
    }
  }

  /**
   * 利用可能な話者一覧を取得します
   * @returns 話者一覧
   */
  public async getSpeakers(): Promise<any[]> {
    try {
      return await this.api.getSpeakers()
    } catch (error) {
      throw handleError('話者一覧の取得中にエラーが発生しました', error)
    }
  }

  /**
   * 指定した話者の情報を取得します
   * @param uuid 話者のUUID
   * @returns 話者情報
   */
  public async getSpeakerInfo(uuid: string): Promise<any> {
    try {
      return await this.api.getSpeakerInfo(uuid)
    } catch (error) {
      throw handleError('話者情報の取得中にエラーが発生しました', error)
    }
  }

  /**
   * 現在の再生を停止します
   */
  public async stopSpeaker(): Promise<string> {
    try {
      this.player.pausePlayback()
      await this.player.clearQueue()
      return '音声再生を停止しました'
    } catch (error) {
      throw handleError('音声停止中にエラーが発生しました', error)
    }
  }

  // ========================================
  // Optional Effect-based API (additional)
  // ========================================

  /**
   * Effect-based text-to-speech with structured error handling
   * @param text テキスト
   * @param speaker 話者ID
   * @param speedScale 再生速度
   * @returns Effect operation result
   */
  public speakEffect(
    text: string,
    speaker?: number,
    speedScale?: number
  ): Effect.Effect<string, VoicevoxEffectError, never> {
    return fromPromise(this.speak(text, speaker, speedScale))
  }

  /**
   * Effect-based audio query generation
   * @param text テキスト
   * @param speaker 話者ID
   * @param speedScale 再生速度
   * @returns Effect operation result
   */
  public generateQueryEffect(
    text: string,
    speaker?: number,
    speedScale?: number
  ): Effect.Effect<AudioQuery, VoicevoxEffectError, never> {
    return fromPromise(this.generateQuery(text, speaker, speedScale))
  }

  /**
   * Effect-based audio file generation
   * @param text テキスト
   * @param output 出力先
   * @param speaker 話者ID
   * @param speedScale 再生速度
   * @returns Effect operation result
   */
  public generateAudioFileEffect(
    text: string,
    output: string,
    speaker?: number,
    speedScale?: number
  ): Effect.Effect<string, VoicevoxEffectError, never> {
    return fromPromise(this.generateAudioFile(text, output, speaker, speedScale))
  }

  /**
   * Effect-based speaker list retrieval
   * @returns Effect operation result
   */
  public getSpeakersEffect(): Effect.Effect<any[], VoicevoxEffectError, never> {
    return fromPromise(this.getSpeakers())
  }

  /**
   * Effect-based speaker info retrieval
   * @param uuid 話者UUID
   * @returns Effect operation result
   */
  public getSpeakerInfoEffect(uuid: string): Effect.Effect<any, VoicevoxEffectError, never> {
    return fromPromise(this.getSpeakerInfo(uuid))
  }

  /**
   * Effect-based speaker stop
   * @returns Effect operation result
   */
  public stopSpeakerEffect(): Effect.Effect<string, VoicevoxEffectError, never> {
    return fromPromise(this.stopSpeaker())
  }

  // ========================================
  // Private methods
  // ========================================

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
      if (input.length === 0) return []

      // 最初の要素で型判定
      if (typeof input[0] === 'string') {
        // string[]の場合
        return (input as string[]).map((text) => ({
          text,
          speaker: defaultSpeaker,
        }))
      }

      // SpeechSegment[]の場合
      return (input as SpeechSegment[]).map((segment) => ({
        text: segment.text,
        speaker: segment.speaker ?? defaultSpeaker,
      }))
    }

    return []
  }

  /**
   * 設定値を検証します
   * @private
   */
  private validateConfig(config: VoicevoxConfig): void {
    if (!config.url) {
      throw new Error('VOICEVOX APIのURLが指定されていません')
    }

    if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) {
      throw new Error('VOICEVOX APIのURLは http:// または https:// で始まる必要があります')
    }

    if (
      config.defaultSpeaker !== undefined &&
      (config.defaultSpeaker < 0 || !Number.isInteger(config.defaultSpeaker))
    ) {
      throw new Error('デフォルト話者IDは0以上の整数である必要があります')
    }

    if (config.defaultSpeedScale !== undefined && (config.defaultSpeedScale <= 0 || config.defaultSpeedScale > 2)) {
      throw new Error('デフォルト再生速度は0より大きく2以下である必要があります')
    }
  }
}
