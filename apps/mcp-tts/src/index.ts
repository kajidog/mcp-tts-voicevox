#!/usr/bin/env node
// MCP TTS Voicevox エントリーポイント

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNodejs, launchServer, setSessionConfig } from '@kajidog/mcp-core'
import { getConfig } from './config.js'
import { createServer, server } from './server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 型定義
interface IndexServerConfig {
  port: number
  host: string
  isDevelopment: boolean
  isHttpMode: boolean
}

/** CLI実行かどうかを判定 */
function isCLI(): boolean {
  if (!isNodejs() || !process.argv) return false

  const isNpmStart = process.env?.npm_lifecycle_event === 'start'
  const argv1 = process.argv[1] || ''
  const isDirectExecution =
    argv1.includes('mcp-tts-voicevox') ||
    argv1.endsWith('dist/index.js') ||
    argv1.endsWith('src/index.ts') ||
    argv1.includes('index.js') ||
    argv1.includes('npx')

  // 設定からHTTPモードを取得（CLI引数または環境変数）
  const config = getConfig()
  const isForceMode = config.httpMode

  // ESM環境でのメインモジュール判定
  const isMainModule =
    process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv0?.includes('node') ||
    process.argv0?.includes('bun')

  return isNpmStart || isDirectExecution || isForceMode || isMainModule
}

/** NPX経由実行かどうかを判定 */
function isNpx(): boolean {
  if (!isNodejs()) return false

  return !!(process.env?.npm_execpath && process.argv[1] && !process.argv[1].includes('node_modules'))
}

/**
 * サーバー設定を取得する関数
 */
function getServerConfig(): IndexServerConfig {
  const config = getConfig()

  return {
    port: config.httpPort,
    host: config.httpHost,
    isDevelopment: process.env.NODE_ENV === 'development',
    isHttpMode: config.httpMode,
  }
}

/**
 * ヘルプメッセージを表示する
 */
function printHelp() {
  console.log(`
Usage: npx @kajidog/mcp-tts-voicevox [options]

Options:
  --help, -h                  Show this help message
  --version, -v               Show version number

  Voicevox Configuration:
  --url <url>                 VOICEVOX Engine URL (default: http://localhost:50021)
  --speaker <id>              Default speaker ID (default: 1)
  --speed <scale>             Default playback speed (default: 1.0)

  Playback Options:
  --use-streaming             Enable streaming playback (ffplay required)
  --no-use-streaming          Disable streaming playback
  --immediate                 Enable immediate playback (default)
  --no-immediate              Disable immediate playback
  --wait-for-start            Wait for playback to start
  --no-wait-for-start         Do not wait for playback to start (default)
  --wait-for-end              Wait for playback to end
  --no-wait-for-end           Do not wait for playback to end (default)

  Restriction Options:
  --restrict-immediate        Restrict AI from using immediate option
  --restrict-wait-for-start   Restrict AI from using waitForStart option
  --restrict-wait-for-end     Restrict AI from using waitForEnd option

  Tool Options:
  --disable-tools <tools>     Comma-separated list of tools to disable
                              (Allowed: speak, speak_player, ping_voicevox,
                               synthesize_file, stop_speaker, get_speakers)

  UI Player Options:
  --auto-play                 Auto-play audio in UI player (default)
  --no-auto-play              Require manual play in UI player

  Server Options:
  --http                      Enable HTTP server mode (remote MCP)
  --port <port>               HTTP server port (default: 3000)
  --host <host>               HTTP server host (default: 0.0.0.0)
  --allowed-hosts <hosts>     Comma-separated list of allowed hosts (default: localhost,127.0.0.1,[::1])
  --allowed-origins <origins> Comma-separated list of allowed origins

Examples:
  npx @kajidog/mcp-tts-voicevox --url http://192.168.1.50:50021 --speaker 3
  npx @kajidog/mcp-tts-voicevox --http --port 8080
  npx @kajidog/mcp-tts-voicevox --disable-tools synthesize_file
`)
}

/**
 * MCP サーバーを起動する
 */
async function startMCPServer(): Promise<void> {
  // 環境チェック
  if (!isNodejs()) {
    throw new Error('Node.js environment required')
  }

  // ヘルプオプションの確認
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  // バージョンオプションの確認
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))
    console.log(`@kajidog/mcp-tts-voicevox v${pkg.version}`)
    process.exit(0)
  }

  // CLI実行またはNPX実行の場合のみサーバーを起動
  const shouldStart = isCLI() || isNpx()

  const config = getConfig()
  const serverConfig = getServerConfig()

  // HTTPモードの場合のみログを出力
  if (serverConfig.isHttpMode) {
    console.error('Environment detection:', {
      isCLI: isCLI(),
      isNpx: isNpx(),
      shouldStart,
      argv1: process.argv[1],
      argv0: process.argv0,
      execPath: process.execPath,
    })

    console.error('Server configuration:', serverConfig)
  }

  if (!shouldStart) {
    if (serverConfig.isHttpMode) {
      console.error('Running as library, server startup skipped')
    }
    return // ライブラリとして使用されている
  }

  // mcp-core のランチャーを使用してサーバーを起動
  await launchServer({
    server,
    config,
    serverName: 'VOICEVOX MCP TTS',
    serverFactory: createServer,
    httpOptions: {
      extraCorsHeaders: ['X-Voicevox-Speaker'],
      onSessionInitialized: (sessionId, request) => {
        // X-Voicevox-Speaker ヘッダーからセッションのデフォルト話者を設定
        const speakerHeader = request.headers.get('X-Voicevox-Speaker')
        if (speakerHeader) {
          const parsed = Number.parseInt(speakerHeader, 10)
          if (!Number.isNaN(parsed) && parsed >= 0) {
            setSessionConfig(sessionId, { defaultSpeaker: parsed })
            console.log(`Session ${sessionId} default speaker: ${parsed}`)
          }
        }
      },
    },
  })
}

// Node.js環境での自動起動
if (isNodejs()) {
  startMCPServer().catch((error) => {
    console.error('Initialization error:', error)
    // ライブラリとしての利用に支障がないように、エラーは無視
  })
}
