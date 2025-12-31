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
  private activeProcesses: Set<ChildProcess> = new Set()
  private linuxPlayer: string | null = null
  private readonly useStreamingOption: boolean | undefined
  private readonly audioDevice?: string

  constructor(useStreaming?: boolean, audioDevice?: string) {
    this.useStreamingOption = useStreaming
    this.audioDevice = audioDevice
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

      // デバイス指定をサポート（ffplayの場合）
      if (this.audioDevice) {
        // ALSAデバイス指定
        args.unshift('-f', 'alsa', '-audio_device', this.audioDevice)
      }

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
          // macOS: ffplayがあればデバイス指定可能
          if (this.audioDevice && this.checkFfplayAvailable()) {
            command = 'ffplay'
            args = ['-nodisp', '-autoexit', '-f', 'avfoundation', '-audio_device_index', this.audioDevice, filePath]
          } else {
            command = 'afplay'
            args = [filePath]
            if (this.audioDevice) {
              console.warn('macOSでのデバイス指定にはffplayが必要です。デフォルトデバイスを使用します。')
            }
          }
          break
        case 'win32': {
          // Windows: ffplayがあればデバイス指定可能
          if (this.audioDevice && this.checkFfplayAvailable()) {
            command = 'ffplay'
            args = ['-nodisp', '-autoexit', '-f', 'dshow', '-audio_device', this.audioDevice, filePath]
          } else {
            command = 'powershell'
            const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            // シンプルなポーリングでMediaPlayer再生を待機
            args = [
              '-c',
              `Add-Type -AssemblyName presentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open('${escapedPath}'); $player.Volume = 0.5; Start-Sleep -Milliseconds 300; $player.Play(); if ($player.NaturalDuration.HasTimeSpan) { $ms = [int]($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 500; Start-Sleep -Milliseconds $ms } else { Start-Sleep -Seconds 5 }; $player.Close()`,
            ]
            if (this.audioDevice) {
              console.warn('Windowsでのデバイス指定にはffplayが必要です。デフォルトデバイスを使用します。')
            }
          }
          break
        }
        case 'linux': {
          command = this.getLinuxPlayer()
          // デバイス指定
          if (this.audioDevice) {
            if (command === 'aplay') {
              args = ['-D', this.audioDevice, filePath]
            } else if (command === 'paplay') {
              args = [`--device=${this.audioDevice}`, filePath]
            } else if (command === 'ffplay') {
              args = ['-nodisp', '-autoexit', '-f', 'alsa', '-audio_device', this.audioDevice, filePath]
            } else {
              args = [filePath]
            }
          } else {
            args = command === 'ffplay' ? ['-nodisp', '-autoexit', filePath] : [filePath]
          }
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

/**
 * 現在の環境に適した再生戦略を作成
 * @param useStreaming ストリーミング再生を使用するかどうか
 * @param audioDevice 音声出力デバイス
 */
export function createPlaybackStrategy(useStreaming?: boolean, audioDevice?: string): PlaybackStrategy {
  if (isBrowser()) {
    return new BrowserPlaybackStrategy()
  }
  return new NodePlaybackStrategy(useStreaming, audioDevice)
}

/**
 * オーディオデバイス情報
 */
export interface AudioDeviceInfo {
  id: string
  name: string
  type?: 'output' | 'input'
}

/**
 * 利用可能なオーディオデバイスをリスト
 */
export async function listAudioDevices(): Promise<{
  devices: AudioDeviceInfo[]
  platform: string
  supported: boolean
  error?: string
}> {
  const platform = os.platform()
  const result: { devices: AudioDeviceInfo[]; platform: string; supported: boolean; error?: string } = {
    devices: [],
    platform,
    supported: false,
  }

  try {
    switch (platform) {
      case 'linux': {
        result.supported = true
        // ALSAデバイスを列挙
        try {
          const aplayOutput = execSync('aplay -l 2>/dev/null', { encoding: 'utf-8' })
          const cardMatches = aplayOutput.matchAll(/card (\d+): ([^\[]+)\[([^\]]+)\]/g)
          for (const match of cardMatches) {
            result.devices.push({
              id: `hw:${match[1]}`,
              name: match[3].trim(),
              type: 'output',
            })
          }
        } catch {
          // aplayがない場合は無視
        }
        // PulseAudioデバイスも試す
        try {
          const pactlOutput = execSync('pactl list short sinks 2>/dev/null', { encoding: 'utf-8' })
          const lines = pactlOutput.trim().split('\n')
          for (const line of lines) {
            const parts = line.split('\t')
            if (parts.length >= 2) {
              result.devices.push({
                id: parts[1],
                name: parts[1],
                type: 'output',
              })
            }
          }
        } catch {
          // pactlがない場合は無視
        }
        break
      }
      case 'darwin': {
        // macOS: ffplayがあればデバイスリスト可能
        try {
          execSync('which ffplay', { stdio: 'ignore' })
          result.supported = true
          // AVFoundationデバイスを列挙
          try {
            const ffmpegOutput = execSync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true', {
              encoding: 'utf-8',
            })
            const audioMatches = ffmpegOutput.matchAll(/\[(\d+)\] (.+)/g)
            let isAudioSection = false
            for (const line of ffmpegOutput.split('\n')) {
              if (line.includes('audio devices')) {
                isAudioSection = true
                continue
              }
              if (isAudioSection) {
                const match = line.match(/\[(\d+)\] (.+)/)
                if (match) {
                  result.devices.push({
                    id: match[1],
                    name: match[2].trim(),
                    type: 'output',
                  })
                }
              }
            }
          } catch {
            // ffmpegがない場合は無視
          }
        } catch {
          result.error = 'macOSでのデバイスリストにはffplayが必要です'
        }
        break
      }
      case 'win32': {
        // Windows: ffplayがあればデバイスリスト可能
        try {
          execSync('where ffplay', { stdio: 'ignore' })
          result.supported = true
          // DirectShowデバイスを列挙
          try {
            const ffmpegOutput = execSync('ffmpeg -f dshow -list_devices true -i "" 2>&1 || echo ""', {
              encoding: 'utf-8',
            })
            const lines = ffmpegOutput.split('\n')
            let isAudioSection = false
            for (const line of lines) {
              if (line.includes('audio devices') || line.includes('DirectShow audio')) {
                isAudioSection = true
                continue
              }
              if (isAudioSection && line.includes('"')) {
                const match = line.match(/"([^"]+)"/)
                if (match) {
                  result.devices.push({
                    id: match[1],
                    name: match[1],
                    type: 'output',
                  })
                }
              }
            }
          } catch {
            // ffmpegがない場合は無視
          }
        } catch {
          result.error = 'Windowsでのデバイスリストにはffplayが必要です'
        }
        break
      }
      default:
        result.error = `サポートされていないプラットフォームです: ${platform}`
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }

  return result
}
