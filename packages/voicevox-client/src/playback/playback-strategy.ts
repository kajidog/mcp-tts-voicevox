import { type ChildProcess, execSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { isBrowser, isTestEnvironment } from '../utils'
import type { PlaybackStrategy } from './types'

/**
 * ブラウザ環境用再生戦略
 */
export class BrowserPlaybackStrategy implements PlaybackStrategy {
  private audioElement: HTMLAudioElement | null = null

  supportsStreaming(): boolean {
    return false
  }

  async playFromBuffer(_data: ArrayBuffer, _signal?: AbortSignal): Promise<void> {
    throw new Error('ブラウザ環境ではバッファからの直接再生はサポートされていません')
  }

  async playFromFile(blobUrl: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 中断シグナルのチェック
      if (signal?.aborted) {
        resolve()
        return
      }

      // 既存の音声要素があれば停止
      if (this.audioElement) {
        this.audioElement.pause()
        this.audioElement.src = ''
        this.audioElement.load()
      }

      this.audioElement = new Audio()
      this.audioElement.preload = 'auto'
      this.audioElement.crossOrigin = 'anonymous'

      // 中断処理
      const abortHandler = () => {
        this.stop()
        resolve()
      }
      signal?.addEventListener('abort', abortHandler)

      this.audioElement.onended = () => {
        signal?.removeEventListener('abort', abortHandler)
        resolve()
      }

      this.audioElement.onabort = () => {
        signal?.removeEventListener('abort', abortHandler)
        resolve()
      }

      this.audioElement.onerror = () => {
        signal?.removeEventListener('abort', abortHandler)
        const errorCode = this.audioElement?.error?.code
        const errorMessage = this.audioElement?.error?.message
        if (errorCode !== undefined || errorMessage) {
          reject(new Error(`再生エラー: ${errorMessage || 'Unknown error'} (Code: ${errorCode})`))
        } else {
          // エラーオブジェクトがない場合は継続
          resolve()
        }
      }

      this.audioElement.src = blobUrl
      this.audioElement.load()

      this.audioElement.play().catch((error) => {
        signal?.removeEventListener('abort', abortHandler)
        reject(error)
      })
    })
  }

  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.src = ''
      this.audioElement = null
    }
  }
}

/**
 * Node.js環境用再生戦略
 */
export class NodePlaybackStrategy implements PlaybackStrategy {
  private ffplayAvailable: boolean | null = null
  private currentProcess: ChildProcess | null = null
  private linuxPlayer: string | null = null

  supportsStreaming(): boolean {
    // 環境変数で明示的に無効化されている場合
    const envValue = process.env.VOICEVOX_STREAMING_PLAYBACK
    if (envValue === 'false' || envValue === '0') {
      return false
    }
    return this.checkFfplayAvailable()
  }

  private checkFfplayAvailable(): boolean {
    if (this.ffplayAvailable !== null) {
      return this.ffplayAvailable
    }

    try {
      const platform = os.platform()
      if (platform === 'win32') {
        execSync('where ffplay', { stdio: 'ignore' })
      } else {
        execSync('which ffplay', { stdio: 'ignore' })
      }
      this.ffplayAvailable = true
    } catch {
      this.ffplayAvailable = false
    }

    return this.ffplayAvailable
  }

  async playFromBuffer(data: ArrayBuffer, signal?: AbortSignal): Promise<void> {
    if (!this.checkFfplayAvailable()) {
      throw new Error('ffplayが利用できません。ffmpegをインストールしてください。')
    }

    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        resolve()
        return
      }

      const platform = os.platform()
      const args = ['-nodisp', '-autoexit', '-i', 'pipe:0']
      const spawnOptions: any = {
        stdio: ['pipe', 'ignore', 'ignore'],
      }

      if (platform === 'win32') {
        spawnOptions.windowsHide = true
      }

      const ffplayProcess = spawn('ffplay', args, spawnOptions)
      this.currentProcess = ffplayProcess

      const abortHandler = () => {
        this.stop()
        resolve()
      }
      signal?.addEventListener('abort', abortHandler)

      ffplayProcess.on('close', (code) => {
        signal?.removeEventListener('abort', abortHandler)
        this.currentProcess = null
        if (code === 0 || signal?.aborted) {
          resolve()
        } else {
          reject(new Error(`ffplayプロセスがエラーで終了しました (終了コード: ${code})`))
        }
      })

      ffplayProcess.on('error', (error) => {
        signal?.removeEventListener('abort', abortHandler)
        this.currentProcess = null
        reject(new Error(`ffplayプロセスの起動に失敗しました: ${error.message}`))
      })

      const buffer = Buffer.from(data)
      ffplayProcess.stdin?.write(buffer, (err) => {
        if (err) {
          reject(new Error(`音声データの書き込みに失敗しました: ${err.message}`))
          return
        }
        ffplayProcess.stdin?.end()
      })
    })
  }

  async playFromFile(filePath: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        resolve()
        return
      }

      if (!fs.existsSync(filePath)) {
        reject(new Error(`音声ファイルが見つかりません: ${filePath}`))
        return
      }

      const platform = os.platform()
      let command: string
      let args: string[]

      switch (platform) {
        case 'darwin':
          command = 'afplay'
          args = [filePath]
          break
        case 'win32': {
          command = 'powershell'
          const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          args = [
            '-c',
            `Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; $player.open('${escapedPath}'); $player.Volume = 0.5; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds; Exit;`,
          ]
          break
        }
        case 'linux': {
          command = this.getLinuxPlayer()
          args = command === 'ffplay' ? ['-nodisp', '-autoexit', filePath] : [filePath]
          break
        }
        default:
          reject(new Error(`サポートされていないプラットフォームです: ${platform}`))
          return
      }

      const spawnOptions: any = {
        stdio: 'ignore',
      }

      if (platform === 'win32') {
        spawnOptions.windowsHide = true
      }

      const audioProcess = spawn(command, args, spawnOptions)
      this.currentProcess = audioProcess

      const abortHandler = () => {
        this.stop()
        resolve()
      }
      signal?.addEventListener('abort', abortHandler)

      audioProcess.on('close', (code) => {
        signal?.removeEventListener('abort', abortHandler)
        this.currentProcess = null
        if (code === 0 || signal?.aborted) {
          resolve()
        } else {
          reject(new Error(`音声再生プロセスがエラーで終了しました (終了コード: ${code})`))
        }
      })

      audioProcess.on('error', (error) => {
        signal?.removeEventListener('abort', abortHandler)
        this.currentProcess = null
        reject(new Error(`音声再生プロセスの起動に失敗しました: ${error.message}`))
      })
    })
  }

  private getLinuxPlayer(): string {
    if (this.linuxPlayer !== null) {
      return this.linuxPlayer
    }

    const linuxPlayers = ['aplay', 'paplay', 'play', 'ffplay']
    this.linuxPlayer =
      linuxPlayers.find((player) => {
        try {
          execSync(`which ${player}`, { stdio: 'ignore' })
          return true
        } catch {
          return false
        }
      }) || 'aplay'

    return this.linuxPlayer
  }

  stop(): void {
    if (this.currentProcess) {
      this.currentProcess.kill()
      this.currentProcess = null
    }
  }
}

/**
 * 現在の環境に適した再生戦略を作成
 */
export function createPlaybackStrategy(): PlaybackStrategy {
  if (isBrowser()) {
    return new BrowserPlaybackStrategy()
  }
  return new NodePlaybackStrategy()
}
