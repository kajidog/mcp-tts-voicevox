import { VoicevoxPlayer } from "./player";
import { AudioQuery, SpeechSegment, VoicevoxConfig, PlaybackOptions } from "./types";
import { splitText, isBrowser, downloadBlob } from "./utils";
import { handleError, formatError } from "./error";
import { VoicevoxApi } from "./api";

/**
 * 環境変数から再生オプションを読み取る関数
 */
function getPlaybackOptionsFromEnv(): PlaybackOptions {
  const immediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE;
  const waitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START;
  const waitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END;

  return {
    immediate: immediate !== undefined && (immediate === "true" || immediate === "false") ? immediate === "true" : undefined,
    waitForStart: waitForStart !== undefined && (waitForStart === "true" || waitForStart === "false") ? waitForStart === "true" : undefined,
    waitForEnd: waitForEnd !== undefined && (waitForEnd === "true" || waitForEnd === "false") ? waitForEnd === "true" : undefined,
  };
}

export class VoicevoxClient {
  private readonly player: VoicevoxPlayer;
  private readonly api: VoicevoxApi;
  private readonly defaultSpeaker: number;
  private readonly defaultSpeedScale: number;
  private readonly defaultPlaybackOptions: PlaybackOptions;
  private readonly maxSegmentLength: number;

  constructor(config: VoicevoxConfig) {
    this.validateConfig(config);
    this.defaultSpeaker = config.defaultSpeaker ?? 1;
    this.defaultSpeedScale = config.defaultSpeedScale ?? 1.0;
    
    // 設定から再生オプションを取得し、環境変数でオーバーライド
    const envOptions = getPlaybackOptionsFromEnv();
    this.defaultPlaybackOptions = {};
    
    // 設定オブジェクトの値を最初に設定
    if (config.defaultPlaybackOptions) {
      Object.assign(this.defaultPlaybackOptions, config.defaultPlaybackOptions);
    }
    
    // 環境変数の値でオーバーライド（undefinedでない場合のみ）
    if (envOptions.immediate !== undefined) {
      this.defaultPlaybackOptions.immediate = envOptions.immediate;
    }
    if (envOptions.waitForStart !== undefined) {
      this.defaultPlaybackOptions.waitForStart = envOptions.waitForStart;
    }
    if (envOptions.waitForEnd !== undefined) {
      this.defaultPlaybackOptions.waitForEnd = envOptions.waitForEnd;
    }
    
    this.maxSegmentLength = 150;
    this.api = new VoicevoxApi(config.url);
    this.player = new VoicevoxPlayer(config.url);
  }

  /**
   * テキストを音声に変換して再生します
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async speak(
    text: string,
    speaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * テキスト配列を音声に変換して再生します
   * @param texts 変換するテキストの配列
   * @param speaker 話者ID（オプション、全体のデフォルト）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async speak(
    texts: string[],
    speaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * テキストと話者のペア配列を音声に変換して再生します
   * @param segments テキストと話者のペア配列
   * @param defaultSpeaker デフォルト話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async speak(
    segments: SpeechSegment[],
    defaultSpeaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * テキストを音声に変換して再生します（オプション付き）
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async speak(
    text: string,
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>;

  /**
   * テキスト配列を音声に変換して再生します（オプション付き）
   * @param texts 変換するテキストの配列
   * @param speaker 話者ID（オプション、全体のデフォルト）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async speak(
    texts: string[],
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>;

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
  ): Promise<string>;

  // 実装
  public async speak(
    input: string | string[] | SpeechSegment[],
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string> {
    try {
      const speed = this.getSpeedScale(speedScale);
      const queueManager = this.player.getQueueManager();

      // 入力を統一フォーマットに変換
      const segments = this.normalizeInput(input, speaker);

      if (segments.length === 0) {
        return "テキストが空です";
      }

      const promises: Array<Promise<void>> = [];

      // 最初のセグメントを優先的に処理して再生を早く開始
      if (segments.length > 0) {
        const firstSegment = segments[0];
        const speakerId = this.getSpeakerId(firstSegment.speaker);
        const firstQuery = await this.generateQuery(
          firstSegment.text,
          speakerId
        );
        firstQuery.speedScale = speed;
        
        const { promises: firstPromises } = await queueManager.enqueueQueryWithOptions(
          firstQuery, 
          speakerId, 
          { ...this.defaultPlaybackOptions, ...options }
        );
        
        if (firstPromises.start) promises.push(firstPromises.start);
        if (firstPromises.end) promises.push(firstPromises.end);
      }

      // 残りのセグメントは非同期で処理
      if (segments.length > 1) {
        const processRemainingSegments = async () => {
          for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            const speakerId = this.getSpeakerId(segment.speaker);
            const query = await this.generateQuery(segment.text, speakerId);
            query.speedScale = speed;
            
            const { promises: segmentPromises } = await queueManager.enqueueQueryWithOptions(
              query, 
              speakerId, 
              { ...options, immediate: false } // 最初以外は自動再生しない
            );
            
            if (segmentPromises.start) promises.push(segmentPromises.start);
            if (segmentPromises.end) promises.push(segmentPromises.end);
          }
        };

        processRemainingSegments().catch((error) => {
          console.error("残りのセグメント処理中にエラーが発生しました:", error);
        });
      }

      // 待機オプションに応じて処理
      if (promises.length > 0) {
        await Promise.all(promises);
      }

      const textSummary = segments.map((s) => s.text).join(" ");
      return `音声生成キューに追加しました: ${textSummary}`;
    } catch (error) {
      return formatError("音声生成中にエラーが発生しました", error);
    }
  }

  /**
   * 入力を統一フォーマット（SpeechSegment[]）に変換
   * @private
   */
  private normalizeInput(
    input: string | string[] | SpeechSegment[],
    defaultSpeaker?: number
  ): SpeechSegment[] {
    if (typeof input === "string") {
      // 文字列の場合は分割してセグメント化
      const segments = splitText(input, this.maxSegmentLength);
      return segments.map((text) => ({
        text,
        speaker: defaultSpeaker,
      }));
    }

    if (Array.isArray(input)) {
      // 配列の場合
      if (input.length === 0) return [];

      // SpeechSegment配列かどうかチェック
      if (typeof input[0] === "object" && "text" in input[0]) {
        // SpeechSegment配列の場合
        return (input as SpeechSegment[]).map((segment) => ({
          text: segment.text,
          speaker: segment.speaker || defaultSpeaker,
        }));
      } else {
        // 文字列配列の場合
        return (input as string[]).map((text) => ({
          text,
          speaker: defaultSpeaker,
        }));
      }
    }

    return [];
  }

  /**
   * テキストから音声合成用クエリを生成します
   * @param text 変換するテキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 音声合成用クエリ
   */
  public async generateQuery(
    text: string,
    speaker?: number,
    speedScale?: number
  ): Promise<AudioQuery> {
    try {
      const speakerId = this.getSpeakerId(speaker);
      // 直接APIを使用してクエリを生成
      const query = await this.api.generateQuery(text, speakerId);
      query.speedScale = this.getSpeedScale(speedScale);
      return query;
    } catch (error) {
      throw handleError("クエリ生成中にエラーが発生しました", error);
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
      const speakerId = this.getSpeakerId(speaker);
      const speed = this.getSpeedScale(speedScale);

      // ブラウザ環境の場合
      if (isBrowser()) {
        // デフォルトのファイル名を設定
        const filename =
          outputPath ||
          (typeof textOrQuery === "string"
            ? `voice-${textOrQuery
                .substring(0, 10)
                .replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.wav`
            : `voice-${Date.now()}.wav`);

        // クエリを生成または使用
        const query =
          typeof textOrQuery === "string"
            ? await this.generateQuery(textOrQuery, speakerId)
            : { ...textOrQuery };

        // 速度設定
        query.speedScale = speed;

        // 音声合成
        const audioData = await this.api.synthesize(query, speakerId);

        // 直接ダウンロード処理
        return await downloadBlob(audioData, filename);
      }

      // Node.js環境の場合（従来のコード）
      // キューマネージャーにアクセス
      const queueManager = this.player.getQueueManager();

      if (typeof textOrQuery === "string") {
        // テキストからクエリを生成
        const query = await this.generateQuery(textOrQuery, speakerId);
        query.speedScale = speed;

        // 一時ファイル保存またはパス指定の保存
        if (!outputPath) {
          // ブラウザ環境ではデフォルトファイル名を生成
          const defaultFilename = `voice-${textOrQuery
            .substring(0, 10)
            .replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.wav`;
          return await this.player.synthesizeToFile(
            query,
            defaultFilename,
            speakerId
          );
        } else {
          return await this.player.synthesizeToFile(
            query,
            outputPath,
            speakerId
          );
        }
      } else {
        // クエリを使って音声合成
        const query = { ...textOrQuery, speedScale: speed };

        // 一時ファイル保存またはパス指定の保存
        if (!outputPath) {
          // ブラウザ環境ではデフォルトファイル名を生成
          const defaultFilename = `voice-${Date.now()}.wav`;
          return await this.player.synthesizeToFile(
            query,
            defaultFilename,
            speakerId
          );
        } else {
          return await this.player.synthesizeToFile(
            query,
            outputPath,
            speakerId
          );
        }
      }
    } catch (error) {
      throw handleError("音声ファイル生成中にエラーが発生しました", error);
    }
  }

  /**
   * テキストを音声ファイル生成キューに追加します
   * @param text テキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    text: string,
    speaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * テキスト配列を音声ファイル生成キューに追加します
   * @param texts テキスト配列
   * @param speaker 話者ID（オプション、全体のデフォルト）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    texts: string[],
    speaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * テキストと話者のペア配列を音声ファイル生成キューに追加します
   * @param segments テキストと話者のペア配列
   * @param defaultSpeaker デフォルト話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    segments: SpeechSegment[],
    defaultSpeaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * 音声合成用クエリを音声ファイル生成キューに追加します
   * @param query 音声合成用クエリ
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    query: AudioQuery,
    speaker?: number,
    speedScale?: number
  ): Promise<string>;

  /**
   * テキストを音声ファイル生成キューに追加します（オプション付き）
   * @param text テキスト
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    text: string,
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>;

  /**
   * テキスト配列を音声ファイル生成キューに追加します（オプション付き）
   * @param texts テキスト配列
   * @param speaker 話者ID（オプション、全体のデフォルト）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    texts: string[],
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>;

  /**
   * テキストと話者のペア配列を音声ファイル生成キューに追加します（オプション付き）
   * @param segments テキストと話者のペア配列
   * @param defaultSpeaker デフォルト話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    segments: SpeechSegment[],
    defaultSpeaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>;

  /**
   * 音声合成用クエリを音声ファイル生成キューに追加します（オプション付き）
   * @param query 音声合成用クエリ
   * @param speaker 話者ID（オプション）
   * @param speedScale 再生速度（オプション）
   * @param options 再生オプション
   * @returns 処理結果のメッセージ
   */
  public async enqueueAudioGeneration(
    query: AudioQuery,
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string>;

  // 実装
  public async enqueueAudioGeneration(
    input: string | string[] | SpeechSegment[] | AudioQuery,
    speaker?: number,
    speedScale?: number,
    options?: PlaybackOptions
  ): Promise<string> {
    try {
      const speed = this.getSpeedScale(speedScale);
      const queueManager = this.player.getQueueManager();

      // AudioQueryの場合
      if (
        typeof input === "object" &&
        !Array.isArray(input) &&
        "accent_phrases" in input
      ) {
        const speakerId = this.getSpeakerId(speaker);
        const query = { ...input, speedScale: speed };
        const { promises } = await queueManager.enqueueQueryWithOptions(query, speakerId, options);
        
        // 待機オプションに応じて処理
        const waitPromises: Array<Promise<void>> = [];
        if (promises.start) waitPromises.push(promises.start);
        if (promises.end) waitPromises.push(promises.end);
        if (waitPromises.length > 0) {
          await Promise.all(waitPromises);
        }
        
        return `クエリをキューに追加しました`;
      }

      // テキスト系の場合
      const segments = this.normalizeInput(
        input as string | string[] | SpeechSegment[],
        speaker
      );

      if (segments.length === 0) {
        return "テキストが空です";
      }

      const promises: Array<Promise<void>> = [];

      // 最初のセグメントを優先処理
      if (segments.length > 0) {
        const firstSegment = segments[0];
        const speakerId = this.getSpeakerId(firstSegment.speaker);
        const firstQuery = await this.generateQuery(
          firstSegment.text,
          speakerId
        );
        firstQuery.speedScale = speed;
        
        const { promises: firstPromises } = await queueManager.enqueueQueryWithOptions(
          firstQuery, 
          speakerId, 
          { ...this.defaultPlaybackOptions, ...options }
        );
        
        if (firstPromises.start) promises.push(firstPromises.start);
        if (firstPromises.end) promises.push(firstPromises.end);
      }

      // 残りのセグメントは非同期で処理
      if (segments.length > 1) {
        const processRemainingSegments = async () => {
          for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            const speakerId = this.getSpeakerId(segment.speaker);
            const query = await this.generateQuery(segment.text, speakerId);
            query.speedScale = speed;
            
            const { promises: segmentPromises } = await queueManager.enqueueQueryWithOptions(
              query, 
              speakerId, 
              { ...options, immediate: false } // 最初以外は自動再生しない
            );
            
            if (segmentPromises.start) promises.push(segmentPromises.start);
            if (segmentPromises.end) promises.push(segmentPromises.end);
          }
        };

        processRemainingSegments().catch((error) => {
          console.error("残りのセグメント処理中にエラーが発生しました:", error);
        });
      }

      // 待機オプションに応じて処理
      if (promises.length > 0) {
        await Promise.all(promises);
      }

      return `テキストをキューに追加しました`;
    } catch (error) {
      return formatError("音声生成中にエラーが発生しました", error);
    }
  }

  /**
   * 話者IDを取得（指定がない場合はデフォルト値を使用）
   * @private
   */
  private getSpeakerId(speaker?: number): number {
    return speaker ?? this.defaultSpeaker;
  }

  /**
   * 再生速度を取得（指定がない場合はデフォルト値を使用）
   * @private
   */
  private getSpeedScale(speedScale?: number): number {
    return speedScale ?? this.defaultSpeedScale;
  }

  private validateConfig(config: VoicevoxConfig): void {
    if (!config.url) {
      throw new Error("VOICEVOXのURLが指定されていません");
    }
    try {
      new URL(config.url);
    } catch {
      throw new Error("無効なVOICEVOXのURLです");
    }
  }

  /**
   * キューをクリア
   */
  public async clearQueue(): Promise<void> {
    return this.player.clearQueue();
  }

  /**
   * スピーカー一覧を取得します
   * @returns スピーカー情報の配列
   */
  public async getSpeakers() {
    try {
      return await this.api.getSpeakers();
    } catch (error) {
      throw handleError("スピーカー一覧取得中にエラーが発生しました", error);
    }
  }

  /**
   * スピーカーの情報を取得
   * @param uuid スピーカーUUID
   * @returns スピーカー情報
   */
  public async getSpeakerInfo(uuid: string) {
    try {
      return await this.api.getSpeakerInfo(uuid);
    } catch (error) {
      throw handleError("スピーカー情報取得中にエラーが発生しました", error);
    }
  }
}