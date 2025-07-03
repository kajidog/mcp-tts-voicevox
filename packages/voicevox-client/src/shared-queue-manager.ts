import { v4 as uuidv4 } from "uuid";
import { AudioQuery, PlaybackOptions } from "./types";
import {
  QueueItem,
  QueueItemStatus,
  QueueEventType,
  QueueEventListener,
  QueueManager,
  VoicevoxApiLike,
} from "./queue/types";
import { AudioFileManager } from "./queue/file-manager";
import { EventManager } from "./queue/event-manager";
import { AudioGenerator } from "./queue/audio-generator";
import { AudioPlayer } from "./queue/audio-player";
import { isBrowser } from "./utils";

/**
 * 複数のVoicevoxClientインスタンス間で共有されるキューマネージャー
 * 各エンジン固有のAPI呼び出しを受け取り、統一キューで管理する
 */
export class SharedQueueManager implements QueueManager {
  private queue: QueueItem[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private prefetchSize: number = 2;
  private currentPlayingItem: QueueItem | null = null;
  private immediatePlayIntervals: Set<NodeJS.Timeout> = new Set();

  // 依存コンポーネント
  private fileManager: AudioFileManager;
  private eventManager: EventManager;
  private audioPlayer: AudioPlayer;
  private immediatePlayer: AudioPlayer; // 即時再生用の専用プレイヤー

  /**
   * コンストラクタ
   * @param prefetchSize 事前生成するアイテム数
   */
  constructor(prefetchSize: number = 2) {
    this.prefetchSize = prefetchSize;

    // 依存コンポーネントを初期化
    this.fileManager = new AudioFileManager();
    this.eventManager = new EventManager();
    this.audioPlayer = new AudioPlayer();
    this.immediatePlayer = new AudioPlayer(); // 即時再生用プレイヤー
  }

  /**
   * キューに新しいテキストを追加（オプション付き）
   * エンジン情報とAPIインスタンスを指定して音声生成を行う
   */
  async enqueueTextWithOptions(
    text: string,
    speaker: number,
    engineName: string,
    apiInstance: VoicevoxApiLike,
    options?: PlaybackOptions
  ): Promise<{ item: QueueItem; promises: { start?: Promise<void>; end?: Promise<void> } }> {
    const playbackPromiseResolvers: any = {};
    const promises: { start?: Promise<void>; end?: Promise<void> } = {};

    // 待機オプションに応じてPromiseを作成
    if (options?.waitForStart) {
      promises.start = new Promise<void>((resolve) => {
        playbackPromiseResolvers.startResolve = resolve;
      });
    }
    if (options?.waitForEnd) {
      promises.end = new Promise<void>((resolve) => {
        playbackPromiseResolvers.endResolve = resolve;
      });
    }

    const item: QueueItem = {
      id: uuidv4(),
      text: text,
      speaker,
      status: QueueItemStatus.PENDING,
      createdAt: new Date(),
      options: options || {},
      playbackPromiseResolvers,
      engineName,
      apiInstance,
    };

    this.queue.push(item);
    this.eventManager.emitEvent(QueueEventType.ITEM_ADDED, item);

    try {
      // 非同期で音声生成を開始
      this.updateItemStatus(item, QueueItemStatus.GENERATING);
      const query = await apiInstance.generateQuery(text, speaker);
      item.query = query;
      
      // AudioGeneratorを使わずに直接音声生成
      await this.generateAudioFromQuery(item, apiInstance);

      // immediateオプションがtrueの場合は即座に再生
      if (options?.immediate === true) {
        // 即時再生の処理
        this.playImmediately(item);
      } else if (options?.immediate !== false) {
        // immediateが未設定またはfalse以外の場合は通常のキュー処理
        this.processQueue();
      }

      return { item, promises };
    } catch (error) {
      // エラー発生時の処理
      item.error = error instanceof Error ? error : new Error(String(error));
      this.updateItemStatus(item, QueueItemStatus.ERROR);
      this.eventManager.emitEvent(QueueEventType.ERROR, item);

      // エラー発生時はキューからアイテムを削除
      const itemIndex = this.queue.findIndex((i) => i.id === item.id);
      if (itemIndex !== -1) {
        this.queue.splice(itemIndex, 1);
      }
      this.eventManager.emitEvent(QueueEventType.ITEM_REMOVED, item);

      throw error; // エラーを再スロー
    }
  }

  /**
   * キューに音声合成用クエリを追加（オプション付き）
   */
  public async enqueueQueryWithOptions(
    query: AudioQuery,
    speaker: number,
    engineName: string,
    apiInstance: VoicevoxApiLike,
    options?: PlaybackOptions
  ): Promise<{ item: QueueItem; promises: { start?: Promise<void>; end?: Promise<void> } }> {
    const playbackPromiseResolvers: any = {};
    const promises: { start?: Promise<void>; end?: Promise<void> } = {};

    // 待機オプションに応じてPromiseを作成
    if (options?.waitForStart) {
      promises.start = new Promise<void>((resolve) => {
        playbackPromiseResolvers.startResolve = resolve;
      });
    }
    if (options?.waitForEnd) {
      promises.end = new Promise<void>((resolve) => {
        playbackPromiseResolvers.endResolve = resolve;
      });
    }

    const item: QueueItem = {
      id: uuidv4(),
      text: "（クエリから生成）",
      speaker,
      status: QueueItemStatus.PENDING,
      createdAt: new Date(),
      query,
      options: options || {},
      playbackPromiseResolvers,
      engineName,
      apiInstance,
    };

    this.queue.push(item);
    this.eventManager.emitEvent(QueueEventType.ITEM_ADDED, item);

    // 非同期で音声生成を開始
    this.generateAudioFromQuery(item, apiInstance)
      .catch((e) => {
        console.error("Unhandled error during generateAudioFromQuery:", e);
      });

    // immediateオプションがtrueの場合は即座に再生
    if (options?.immediate === true) {
      // 即時再生の処理
      this.playImmediately(item);
    } else if (options?.immediate !== false) {
      // immediateが未設定またはfalse以外の場合は通常のキュー処理
      this.processQueue();
    }

    return { item, promises };
  }

  /**
   * 互換性のためのメソッド - SharedQueueManagerでは使用しない
   */
  async enqueueText(text: string, speaker: number): Promise<QueueItem> {
    throw new Error("SharedQueueManager.enqueueText is not supported. Use enqueueTextWithOptions instead.");
  }

  /**
   * 互換性のためのメソッド - SharedQueueManagerでは使用しない
   */
  public async enqueueQuery(query: AudioQuery, speaker: number): Promise<QueueItem> {
    throw new Error("SharedQueueManager.enqueueQuery is not supported. Use enqueueQueryWithOptions instead.");
  }

  /**
   * クエリから音声データを生成
   */
  private async generateAudioFromQuery(item: QueueItem, apiInstance: VoicevoxApiLike): Promise<void> {
    if (!item.query) {
      throw new Error("Query is required for audio generation");
    }

    try {
      this.updateItemStatus(item, QueueItemStatus.GENERATING);
      
      // 音声合成
      const audioData = await apiInstance.synthesize(item.query, item.speaker);
      item.audioData = audioData;

      // 一時ファイルに保存
      const tempFile = await this.fileManager.saveTempAudioFile(audioData);
      item.tempFile = tempFile;

      this.updateItemStatus(item, QueueItemStatus.READY);
    } catch (error) {
      item.error = error instanceof Error ? error : new Error(String(error));
      this.updateItemStatus(item, QueueItemStatus.ERROR);
      this.eventManager.emitEvent(QueueEventType.ERROR, item);
      throw error;
    }
  }

  /**
   * キューからアイテムを削除
   */
  public async removeItem(itemId: string): Promise<boolean> {
    const index = this.queue.findIndex((item) => item.id === itemId);

    if (index === -1) {
      return false;
    }

    const item = this.queue[index];

    // 一時ファイルがあれば削除
    if (item.tempFile) {
      await this.fileManager.deleteTempFile(item.tempFile);
    }

    // キューから削除
    const removedItem = this.queue.splice(index, 1)[0];
    this.eventManager.emitEvent(QueueEventType.ITEM_REMOVED, removedItem);

    // もし削除されたアイテムが再生中だったら停止
    if (this.currentPlayingItem?.id === itemId) {
      this.currentPlayingItem = null;
    }

    return true;
  }

  /**
   * キューをクリア
   */
  public async clearQueue(): Promise<void> {
    // 削除処理中にキューが変更される可能性があるので、先にIDリストを取得
    const itemIdsToDelete = this.queue.map((item) => item.id);

    // 各アイテムに対して削除処理（一時ファイル削除含む）を実行
    await Promise.all(itemIdsToDelete.map((id) => this.removeItem(id)));

    // 念のためキューを空にする（removeItemで空になっているはずだが）
    this.queue = [];

    // 再生状態をリセット
    this.isPlaying = false;
    this.isPaused = false;
    if (this.currentPlayingItem) {
      this.currentPlayingItem = null;
    }

    this.eventManager.emitEvent(QueueEventType.QUEUE_CLEARED);
  }

  // --- 再生制御 ---
  public async startPlayback(): Promise<void> {
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.isPaused = false;
      this.eventManager.emitEvent(QueueEventType.PLAYBACK_STARTED);
      this.processQueue();
    }
  }

  public async pausePlayback(): Promise<void> {
    if (this.isPlaying && !this.isPaused) {
      this.isPaused = true;
      // 再生中のアイテムがあれば状態をPAUSEDに変更
      if (this.currentPlayingItem) {
        this.updateItemStatus(this.currentPlayingItem, QueueItemStatus.PAUSED);
      }
      this.eventManager.emitEvent(QueueEventType.PLAYBACK_PAUSED);
    }
  }

  public async resumePlayback(): Promise<void> {
    if (this.isPlaying && this.isPaused) {
      this.isPaused = false;
      // 一時停止中のアイテムがあれば状態をPLAYINGに戻す
      if (this.currentPlayingItem) {
        this.updateItemStatus(this.currentPlayingItem, QueueItemStatus.PLAYING);
      }
      this.eventManager.emitEvent(QueueEventType.PLAYBACK_RESUMED);
      this.processQueue();
    }
  }

  /**
   * 次のアイテムを再生する
   */
  public async playNext(): Promise<void> {
    if (!this.isPlaying) {
      this.isPlaying = true;
    }
    this.isPaused = false;

    // キュー処理を開始
    this.processQueue();
  }

  /**
   * イベントリスナーを追加
   */
  public addEventListener(
    event: QueueEventType,
    listener: QueueEventListener
  ): void {
    this.eventManager.addEventListener(event, listener);
  }

  /**
   * イベントリスナーを削除
   */
  public removeEventListener(
    event: QueueEventType,
    listener: QueueEventListener
  ): void {
    this.eventManager.removeEventListener(event, listener);
  }

  /**
   * 現在のキュー内のアイテムを取得
   */
  public getQueue(): QueueItem[] {
    // 不変性を保つためにコピーを返す
    return [...this.queue];
  }

  /**
   * 特定のアイテムの状態を取得
   */
  public getItemStatus(itemId: string): QueueItemStatus | null {
    const item = this.queue.find((item) => item.id === itemId);
    return item ? item.status : null;
  }

  /**
   * 即時再生処理
   * キューを経由せず直接音声を再生
   */
  private async playImmediately(item: QueueItem): Promise<void> {
    // 音声ファイルが生成されるまで待機
    const checkInterval = setInterval(async () => {
      if (item.status === QueueItemStatus.READY && item.tempFile) {
        clearInterval(checkInterval);
        this.immediatePlayIntervals.delete(checkInterval);
        
        // 再生開始の通知
        if (item.playbackPromiseResolvers?.startResolve) {
          item.playbackPromiseResolvers.startResolve();
        }
        
        try {
          // 即時再生用プレイヤーで再生
          this.updateItemStatus(item, QueueItemStatus.PLAYING);
          await this.immediatePlayer.playAudio(item.tempFile);
          
          // 再生完了
          this.updateItemStatus(item, QueueItemStatus.DONE);
          this.eventManager.emitEvent(QueueEventType.ITEM_COMPLETED, item);
          
          // 再生終了の通知
          if (item.playbackPromiseResolvers?.endResolve) {
            item.playbackPromiseResolvers.endResolve();
          }
          
          // 一時ファイルを削除
          if (item.tempFile) {
            await this.fileManager.deleteTempFile(item.tempFile);
          }
          
          // キューから削除
          const itemIndex = this.queue.findIndex((i) => i.id === item.id);
          if (itemIndex !== -1) {
            this.queue.splice(itemIndex, 1);
          }
        } catch (error) {
          console.error(`Error playing audio immediately:`, error);
          this.updateItemStatus(item, QueueItemStatus.ERROR);
          item.error = error instanceof Error ? error : new Error(String(error));
          this.eventManager.emitEvent(QueueEventType.ERROR, item);
          
          // エラー時もキューから削除
          const itemIndex = this.queue.findIndex((i) => i.id === item.id);
          if (itemIndex !== -1) {
            this.queue.splice(itemIndex, 1);
          }
        }
      } else if (item.status === QueueItemStatus.ERROR) {
        clearInterval(checkInterval);
        this.immediatePlayIntervals.delete(checkInterval);
        // エラー時の処理は既に音声生成時に行われているはず
      }
    }, 50); // 50msごとにチェック
    
    this.immediatePlayIntervals.add(checkInterval);
  }

  /**
   * キュー処理実行
   * キューにある音声の生成と再生を処理
   */
  private async processQueue(): Promise<void> {
    // 再生を停止中またはポーズ中は何もしない
    if (!this.isPlaying || this.isPaused) {
      return;
    }

    // 現在再生中のアイテムがあれば再生中のまま
    if (this.currentPlayingItem?.status === QueueItemStatus.PLAYING) {
      return;
    }

    // 前回再生したアイテムの後処理
    if (
      this.currentPlayingItem &&
      this.currentPlayingItem.status === QueueItemStatus.DONE
    ) {
      // 再生完了したアイテムの一時ファイルを削除
      if (this.currentPlayingItem.tempFile) {
        await this.fileManager.deleteTempFile(this.currentPlayingItem.tempFile);
        this.currentPlayingItem.tempFile = undefined; // 削除後に参照を消す
      }

      this.currentPlayingItem = null;
    }

    // 再生可能なアイテムを探す
    const nextItem = this.queue.find(
      (item) => item.status === QueueItemStatus.READY
    );

    if (!nextItem) {
      // 再生可能なアイテムがなければ、事前生成を開始して終了
      this.prefetchAudio();
      return;
    }

    this.currentPlayingItem = nextItem;
    this.updateItemStatus(nextItem, QueueItemStatus.PLAYING);

    // 再生開始の通知（waitForStartオプション対応）
    if (nextItem.playbackPromiseResolvers?.startResolve) {
      nextItem.playbackPromiseResolvers.startResolve();
    }

    try {
      if (!nextItem.tempFile) {
        throw new Error("再生対象の一時ファイルが見つかりません");
      }

      await this.audioPlayer.playAudio(nextItem.tempFile);

      // 再生完了
      this.updateItemStatus(nextItem, QueueItemStatus.DONE);
      this.eventManager.emitEvent(QueueEventType.ITEM_COMPLETED, nextItem);

      // 再生終了の通知（waitForEndオプション対応）
      if (nextItem.playbackPromiseResolvers?.endResolve) {
        nextItem.playbackPromiseResolvers.endResolve();
      }

      // キューから削除
      const itemIndex = this.queue.findIndex((i) => i.id === nextItem.id);
      if (itemIndex !== -1) {
        this.queue.splice(itemIndex, 1);
      }

      // 続けて次のアイテムを再生
      this.currentPlayingItem = null;
      this.processQueue();
    } catch (error) {
      console.error(`Error playing audio:`, error);
      this.updateItemStatus(nextItem, QueueItemStatus.ERROR);
      nextItem.error =
        error instanceof Error ? error : new Error(String(error));
      this.eventManager.emitEvent(QueueEventType.ERROR, nextItem);

      // エラー発生時もキューからアイテムを削除
      const itemIndex = this.queue.findIndex((i) => i.id === nextItem.id);
      if (itemIndex !== -1) {
        this.queue.splice(itemIndex, 1);
      }

      // エラー発生時でも次のアイテムを再生
      this.currentPlayingItem = null;
      this.processQueue();
    }

    // 次回の音声を事前生成
    this.prefetchAudio();
  }

  /**
   * 次のアイテムの音声を事前に生成 (プリフェッチ)
   */
  private async prefetchAudio(): Promise<void> {
    const pendingItems = this.queue.filter(
      (item) => item.status === QueueItemStatus.PENDING
    );
    const processingOrReadyCount = this.queue.filter(
      (item) =>
        item.status === QueueItemStatus.READY ||
        item.status === QueueItemStatus.GENERATING
    ).length;

    const prefetchNeeded = this.prefetchSize - processingOrReadyCount;

    if (prefetchNeeded > 0 && pendingItems.length > 0) {
      const itemsToPrefetch = pendingItems.slice(0, prefetchNeeded);
      await Promise.all(
        itemsToPrefetch.map((item) => {
          if (item.query && item.apiInstance) {
            return this.generateAudioFromQuery(item, item.apiInstance)
              .catch((e) => console.error("Prefetch error:", e));
          }
          return Promise.resolve();
        })
      );
    }
  }

  /**
   * アイテムの状態を更新し、イベントを発火
   */
  private updateItemStatus(item: QueueItem, status: QueueItemStatus): void {
    item.status = status;
    // 状態変更イベントを発火
    this.eventManager.emitEvent(QueueEventType.ITEM_STATUS_CHANGED, item);

    // READYになったらプリフェッチとキュー処理をトリガー
    if (status === QueueItemStatus.READY) {
      this.prefetchAudio();
      this.processQueue();
    }
  }

  /**
   * バイナリーデータを一時ファイルに保存
   */
  public async saveTempAudioFile(audioData: ArrayBuffer): Promise<string> {
    return this.fileManager.saveTempAudioFile(audioData);
  }

  /**
   * FileManagerインスタンスを取得
   */
  public getFileManager(): AudioFileManager {
    return this.fileManager;
  }

  /**
   * 全てのリソースをクリーンアップ
   */
  public cleanup(): void {
    // すべてのblobURLをリリース
    if (isBrowser()) {
      this.fileManager.releaseAllBlobUrls();
    }

    // 一時ファイルがあれば削除
    this.queue.forEach((item) => {
      if (item.tempFile) {
        this.fileManager.deleteTempFile(item.tempFile);
      }
    });

    // 即時再生用のインターバルをクリア
    this.immediatePlayIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.immediatePlayIntervals.clear();

    // キューをクリア
    this.queue = [];
    this.isPlaying = false;
    this.isPaused = false;
    this.currentPlayingItem = null;
  }
}