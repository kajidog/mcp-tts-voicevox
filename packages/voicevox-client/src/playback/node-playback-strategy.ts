import { type ChildProcess, execSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import type { PlaybackStrategy } from './types'

/**
 * Node.js環境用再生戦略
 */
export class NodePlaybackStrategy implements PlaybackStrategy {
  private ffplayAvailable: boolean | null = null
  private activeProcesses: Set<ChildProcess> = new Set()
  private linuxPlayer: string | null = null
  private readonly useStreamingOption: boolean | undefined

  constructor(useStreaming?: boolean) {
    this.useStreamingOption = useStreaming
  }

  supportsStreaming(): boolean {
    // 明示的に false が指定されている場合
    if (this.useStreamingOption === false) {
      return false
    }
    // 明示的に true が指定されている場合
    if (this.useStreamingOption === true) {
      return this.checkFfplayAvailable()
    }
    // undefined の場合は環境変数をチェック
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
      this.activeProcesses.add(ffplayProcess)

      // エラーイベントハンドラを先に設定（中断時のエラーを無視するため）
      let isAborted = false

      // stdinのエラーハンドラを設定（write EOFエラーを防ぐ）
      if (ffplayProcess.stdin) {
        ffplayProcess.stdin.on('error', (err) => {
          // 中断時や書き込みエラーは無視（既に処理中の場合）
          if (isAborted || signal?.aborted) {
            return
          }
          // それ以外のエラーはreject（まだresolve/rejectされていない場合）
        })
      }

      const abortHandler = () => {
        isAborted = true
        try {
          // stdinのエラーハンドラを無視設定
          if (ffplayProcess.stdin) {
            ffplayProcess.stdin.removeAllListeners('error')
            ffplayProcess.stdin.on('error', () => {})
          }
          // プロセスのエラーハンドラを設定してからkill
          ffplayProcess.removeAllListeners('error')
          ffplayProcess.on('error', () => {})
          ffplayProcess.kill()
        } catch {
          // kill失敗は無視
        }
        // resolve()はcloseイベントで呼ばれるため、ここでは呼ばない
        // これにより、プロセスが実際に終了するまで待機する
      }
      signal?.addEventListener('abort', abortHandler)

      ffplayProcess.on('close', (code) => {
        signal?.removeEventListener('abort', abortHandler)
        this.activeProcesses.delete(ffplayProcess)
        if (code === 0 || signal?.aborted || isAborted) {
          resolve()
        } else {
          reject(new Error(`ffplayプロセスがエラーで終了しました (終了コード: ${code})`))
        }
      })

      ffplayProcess.on('error', (error) => {
        // 中断による終了時はエラーを無視
        if (isAborted || signal?.aborted) {
          return
        }
        signal?.removeEventListener('abort', abortHandler)
        this.activeProcesses.delete(ffplayProcess)
        reject(new Error(`ffplayプロセスの起動に失敗しました: ${error.message}`))
      })

      const buffer = Buffer.from(data)
      ffplayProcess.stdin?.write(buffer, (err) => {
        // 中断時は書き込みエラーを無視
        if (isAborted || signal?.aborted) {
          return
        }
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
          // シンプルなポーリングでMediaPlayer再生を待機
          args = [
            '-c',
            `Add-Type -AssemblyName presentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${escapedPath}'); $player.Volume = 0.5; Start-Sleep -Milliseconds 300; $player.Play(); if ($player.NaturalDuration.HasTimeSpan) { $ms = [int]($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 500; Start-Sleep -Milliseconds $ms } else { Start-Sleep -Seconds 5 }; $player.Close()`,
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
      this.activeProcesses.add(audioProcess)

      // エラーイベントハンドラを先に設定（中断時のエラーを無視するため）
      let isAborted = false

      const abortHandler = () => {
        isAborted = true
        try {
          // プロセスのエラーハンドラを設定してからkill
          audioProcess.removeAllListeners('error')
          audioProcess.on('error', () => {})
          audioProcess.kill()
        } catch {
          // kill失敗は無視
        }
        // resolve()はcloseイベントで呼ばれるため、ここでは呼ばない
        // これにより、プロセスが実際に終了するまで待機する
      }
      signal?.addEventListener('abort', abortHandler)

      audioProcess.on('close', (code) => {
        signal?.removeEventListener('abort', abortHandler)
        this.activeProcesses.delete(audioProcess)
        if (code === 0 || signal?.aborted || isAborted) {
          resolve()
        } else {
          reject(new Error(`音声再生プロセスがエラーで終了しました (終了コード: ${code})`))
        }
      })

      audioProcess.on('error', (error) => {
        // 中断による終了時はエラーを無視
        if (isAborted || signal?.aborted) {
          return
        }
        signal?.removeEventListener('abort', abortHandler)
        this.activeProcesses.delete(audioProcess)
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
    for (const proc of this.activeProcesses) {
      try {
        // プロセスのstdioストリームのエラーを無視（既に終了中の場合のため）
        if (proc.stdin) {
          proc.stdin.removeAllListeners('error')
          proc.stdin.on('error', () => {})
        }
        if (proc.stdout) {
          proc.stdout.removeAllListeners('error')
          proc.stdout.on('error', () => {})
        }
        if (proc.stderr) {
          proc.stderr.removeAllListeners('error')
          proc.stderr.on('error', () => {})
        }
        // プロセス自体のエラーイベントも無視
        proc.removeAllListeners('error')
        proc.on('error', () => {})

        // プロセスを終了
        proc.kill()
      } catch {
        // kill失敗は無視（既に終了している場合など）
      }
    }
    this.activeProcesses.clear()
  }
}
