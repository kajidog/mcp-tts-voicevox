import { AudioQuery, PlaybackOptions } from "./types";
import { VoicevoxQueueManager, QueueEventType, QueueItemStatus } from "./queue";
import { handleError } from "./error";
import { VoicevoxApi } from "./api";

/**
 * エラーハンドラープロキシ
 * メソッドをエラーハンドリングで包む高階関数
 */
function withErrorHandling<R>(
  method: () => Promise<R>,
  errorMessage: string
): Promise<R> {
  return method().catch((error) => {
    throw handleError(errorMessage, error);
  });
}

/**
 * VOICEVOX音声プレイヤークラス
 * キュー管理システムを使用して音声の合成と再生を行う
 */
export class VoicevoxPlayer {
  private queueManager: VoicevoxQueueManager;

  /**
   * コンストラクタ
   * @param voicevoxUrl VOICEVOX Engine API URL
   * @param prefetchSize 事前生成するアイテム数
   */
  constructor(
    voicevoxUrl: string = "http://localhost:50021",
    prefetchSize: number = 2
  ) {
    // APIインスタンスを作成
    const api = new VoicevoxApi(voicevoxUrl);
    // キューマネージャーにAPIインスタンスを注入
    this.queueManager = new VoicevoxQueueManager(api, prefetchSize);

    // デフォルトで再生を開始
    this.queueManager.startPlayback();

    // エラーイベントのログ記録
    this.queueManager.addEventListener(QueueEventType.ERROR, (_, item) => {
      if (item) {
        console.error(
          `音声合成エラー: ${item.text} (${
            item.error?.message || "不明なエラー"
          })`
        );
      }
    });
  }

  /**
   * テキストをキューに追加（オプション付き）
   * @param text 合成するテキスト
   * @param speaker 話者ID
   * @param options 再生オプション
   */
  public async enqueueWithOptions(
    text: string, 
    speaker: number = 1, 
    options?: PlaybackOptions
  ): Promise<{ start?: Promise<void>; end?: Promise<void> }> {
    return withErrorHandling(async () => {
      const { promises } = await this.queueManager.enqueueTextWithOptions(text, speaker, options);
      return promises;
    }, "テキストのキュー追加中にエラーが発生しました");
  }

  /**
   * テキストをキューに追加（従来の互換性維持）
   * @param text 合成するテキスト
   * @param speaker 話者ID
   */
  public async enqueue(text: string, speaker: number = 1): Promise<void> {
    return withErrorHandling(async () => {
      await this.queueManager.enqueueText(text, speaker);
    }, "テキストのキュー追加中にエラーが発生しました");
  }

  /**
   * クエリを使ってキューに追加（オプション付き）
   * @param query 音声合成用クエリ
   * @param speaker 話者ID
   * @param options 再生オプション
   */
  public async enqueueWithQueryOptions(
    query: AudioQuery,
    speaker: number = 1,
    options?: PlaybackOptions
  ): Promise<{ start?: Promise<void>; end?: Promise<void> }> {
    return withErrorHandling(async () => {
      const { promises } = await this.queueManager.enqueueQueryWithOptions(query, speaker, options);
      return promises;
    }, "クエリのキュー追加中にエラーが発生しました");
  }

  /**
   * クエリを使ってキューに追加（従来の互換性維持）
   * @param query 音声合成用クエリ
   * @param speaker 話者ID
   */
  public async enqueueWithQuery(
    query: AudioQuery,
    speaker: number = 1
  ): Promise<void> {
    return withErrorHandling(async () => {
      await this.queueManager.enqueueQuery(query, speaker);
    }, "クエリのキュー追加中にエラーが発生しました");
  }

  /**
   * クエリを使ってキューに追加（オプション付き）
   * @param query 音声合成用クエリ
   * @param speaker 話者ID
   * @param options 再生オプション
   */
  public async enqueueQueryWithOptions(
    query: AudioQuery,
    speaker: number = 1,
    options?: PlaybackOptions
  ): Promise<{ item: any; promises: { start?: Promise<void>; end?: Promise<void> } }> {
    return withErrorHandling(async () => {
      return await this.queueManager.enqueueQueryWithOptions(query, speaker, options);
    }, "クエリのキュー追加中にエラーが発生しました");
  }

  /**
   * テキストから音声合成用クエリを生成
   * キューマネージャーの内部機能を使用
   * @param text 合成するテキスト
   * @param speaker 話者ID
   */
  public async generateQuery(
    text: string,
    speaker: number = 1
  ): Promise<AudioQuery> {
    return withErrorHandling(async () => {
      // AudioGeneratorのgenerateQueryを直接呼び出す
      return await this.queueManager
        .getAudioGenerator()
        .generateQuery(text, speaker);
    }, "音声合成クエリの生成中にエラーが発生しました");
  }

  /**
   * 音声合成用クエリから音声ファイルを生成
   * 重複を避けるためにQueueManagerの機能に委譲
   *
   * @param query 音声合成用クエリ
   * @param output 出力ファイルパスまたは出力ディレクトリ（省略時は一時ディレクトリに生成）
   * @param speaker 話者ID
   */
  public async synthesizeToFile(
    query: AudioQuery,
    output?: string,
    speaker: number = 1
  ): Promise<string> {
    return withErrorHandling(async () => {
      // クエリから音声を合成
      const api = this.queueManager.getApi();
      const audioData = await api.synthesize(query, speaker);

      // ファイル保存処理をFileManagerに完全に委譲
      const fileManager = this.queueManager.getFileManager();

      // 出力パスが指定されていない場合は一時ファイル、指定されている場合は指定パスに保存
      if (!output) {
        return await fileManager.saveTempAudioFile(audioData);
      } else {
        return await fileManager.saveAudioFile(audioData, output);
      }
    }, "音声ファイル生成中にエラーが発生しました");
  }

  /**
   * 再生を開始
   */
  public startPlayback(): void {
    this.queueManager.startPlayback();
  }

  /**
   * 再生を一時停止
   */
  public pausePlayback(): void {
    this.queueManager.pausePlayback();
  }

  /**
   * 再生を再開
   */
  public resumePlayback(): void {
    this.queueManager.resumePlayback();
  }

  /**
   * キュー内のアイテム数を取得
   */
  public getQueueLength(): number {
    return this.queueManager.getQueue().length;
  }

  /**
   * キューが空かどうかを確認
   */
  public isQueueEmpty(): boolean {
    return this.queueManager.getQueue().length === 0;
  }

  /**
   * キューが再生中かどうかを確認
   */
  public isPlaying(): boolean {
    return this.queueManager
      .getQueue()
      .some((item) => item.status === QueueItemStatus.PLAYING);
  }

  /**
   * キューマネージャーインスタンスを取得
   * 高度な操作のため公開
   */
  public getQueueManager(): VoicevoxQueueManager {
    return this.queueManager;
  }

  /**
   * キューをクリア
   */
  public async clearQueue(): Promise<void> {
    return withErrorHandling(async () => {
      await this.queueManager.clearQueue();
    }, "キューのクリア中にエラーが発生しました");
  }
}
