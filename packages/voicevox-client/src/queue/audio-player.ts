import { handleError } from "../error";
import { isBrowser, isTestEnvironment } from "../utils";
import { spawn } from "child_process";
import * as os from "os";
import * as fs from "fs";

/**
 * 音声再生クラス
 * 音声ファイルの再生処理を担当
 */
export class AudioPlayer {
  private audioElement: HTMLAudioElement | null = null;

  /**
   * 音声ファイルを再生
   * @param filePath 再生する音声ファイル、またはブラウザ環境ではblobURL
   */
  public async playAudio(filePath: string): Promise<void> {
    try {
      if (isBrowser()) {
        // ブラウザでの再生
        return this.playAudioInBrowser(filePath);
      } else {
        // Node.js環境での再生
        return this.playAudioInNodejs(filePath);
      }
    } catch (error) {
      // エラー発生時はハンドリングして再スロー
      throw handleError(
        `音声ファイルの再生中にエラーが発生しました: ${filePath}`,
        error
      );
    }
  }

  /**
   * Node.js環境での音声再生
   * @param filePath 再生する音声ファイルのパス
   */
  private async playAudioInNodejs(filePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        reject(new Error(`音声ファイルが見つかりません: ${filePath}`));
        return;
      }

      // プラットフォームに応じて音声再生コマンドを選択
      const platform = os.platform();
      let command: string;
      let args: string[];

      switch (platform) {
        case "darwin": // macOS
          command = "afplay";
          args = [filePath];
          break;
        case "win32": // Windows
          command = "powershell";
          // より簡単で確実なPowerShellコマンドを使用
          const escapedPath = filePath
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"');
          args = [
            "-c",
            `Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; $player.open('${escapedPath}'); $player.Volume = 0.5; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds; Exit;`,
          ];
          break;
        case "linux": // Linux
          // 利用可能なプレイヤーを順番に試す
          const linuxPlayers = ["aplay", "paplay", "play", "ffplay"];
          command =
            linuxPlayers.find((player) => {
              try {
                const { execSync } = require("child_process");
                execSync(`which ${player}`, { stdio: "ignore" });
                return true;
              } catch {
                return false;
              }
            }) || "aplay"; // デフォルトはaplay
          args =
            command === "ffplay"
              ? ["-nodisp", "-autoexit", filePath]
              : [filePath];
          break;
        default:
          reject(
            new Error(`サポートされていないプラットフォームです: ${platform}`)
          );
          return;
      }

      // 音声再生プロセスを実行
      const spawnOptions: any = {
        stdio: "ignore", // 標準出力を無視
      };

      // WindowsでPowerShellを使用する場合、ウィンドウを非表示にする
      if (platform === "win32") {
        spawnOptions.windowsHide = true;
      }

      const audioProcess = spawn(command, args, spawnOptions);

      audioProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `音声再生プロセスがエラーで終了しました (終了コード: ${code})`
            )
          );
        }
      });

      audioProcess.on("error", (error) => {
        reject(
          new Error(`音声再生プロセスの起動に失敗しました: ${error.message}`)
        );
      });
    });
  }

  /**
   * ブラウザ環境での音声再生
   * @param audioUrl 再生するblobURL
   * @param retryCount 再試行回数（内部使用）
   * @returns 再生完了を示すPromise
   */
  private playAudioInBrowser(
    audioUrl: string,
    retryCount: number = 0
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        console.debug(
          "再生しようとしているURL:",
          audioUrl,
          "試行回数:",
          retryCount
        );

        // 既存の音声要素があれば停止して削除
        if (this.audioElement) {
          this.audioElement.pause();
          this.audioElement.src = "";
          this.audioElement.load(); // メモリ解放のための明示的なリセット
        }

        // 新しい音声要素を作成
        this.audioElement = new Audio();

        // デバッグ用のイベントリスナー
        this.audioElement.addEventListener("loadstart", () =>
          console.debug("Audio loadstart")
        );
        this.audioElement.addEventListener("durationchange", () =>
          console.debug("Audio durationchange:", this.audioElement?.duration)
        );
        this.audioElement.addEventListener("loadedmetadata", () =>
          console.debug("Audio loadedmetadata")
        );
        this.audioElement.addEventListener("canplay", () =>
          console.debug("Audio canplay")
        );

        // サスペンドイベント処理
        this.audioElement.addEventListener("suspend", () => {
          console.debug("Audio suspended");
        });

        // エラーイベントを詳細に捕捉
        this.audioElement.onerror = (event) => {
          const errorCode = this.audioElement?.error?.code;
          const errorMessage = this.audioElement?.error?.message;

          // 実際にエラーオブジェクトが存在するか確認
          if (errorCode !== undefined || errorMessage) {
            console.error("Audio error details:", {
              code: errorCode,
              message: errorMessage,
              event,
            });

            // 最大3回まで再試行
            if (retryCount < 3) {
              console.warn(
                `再生に失敗しました。再試行します (${retryCount + 1}/3)...`
              );
              // 少し待ってから再試行
              setTimeout(() => {
                this.playAudioInBrowser(audioUrl, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, 300);
              return;
            }

            reject(
              new Error(
                `Audio playback error: ${
                  errorMessage || "Unknown error"
                } (Code: ${errorCode})`
              )
            );
          } else {
            // エラーオブジェクトがないがイベントが発生した場合は警告として扱う
            console.warn(
              "Audio event triggered but no error details available. Continuing playback..."
            );
            // エラーイベントが発生しても実際のエラーがなければ再生を続行
            // ここでrejectしないことで再生を継続
          }
        };

        // 成功イベント
        this.audioElement.onended = () => {
          console.debug("Audio playback completed successfully");
          resolve();
        };

        // 中断イベント
        this.audioElement.onabort = () => {
          console.debug("Audio playback aborted");
          resolve(); // 中断も完了として扱う
        };

        // 事前にpreloadを設定
        this.audioElement.preload = "auto";

        // クロスオリジン設定
        this.audioElement.crossOrigin = "anonymous";

        // ソースを設定してロード
        this.audioElement.src = audioUrl;
        this.audioElement.load();

        // 再生開始
        this.audioElement
          .play()
          .then(() => {
            console.debug("Audio playback started successfully");
          })
          .catch((error) => {
            console.error("Failed to start audio playback:", error);

            // 最大3回まで再試行
            if (retryCount < 3) {
              console.warn(
                `再生開始に失敗しました。再試行します (${retryCount + 1}/3)...`
              );
              // 少し待ってから再試行
              setTimeout(() => {
                this.playAudioInBrowser(audioUrl, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, 300);
              return;
            }

            reject(error);
          });
      } catch (error) {
        console.error("Unexpected error in audio playback:", error);
        reject(error);
      }
    });
  }

  /**
   * エラーをログ出力
   * @param message エラーメッセージ
   * @param error エラーオブジェクト
   */
  public logError(message: string, error: unknown): void {
    // テスト環境ではエラーログを出力しない
    if (!isTestEnvironment()) {
      console.error(message, error);
    }
  }
}
