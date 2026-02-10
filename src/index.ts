#!/usr/bin/env node
// MCP TTS Voicevox エントリーポイント

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 型定義
interface IndexServerConfig {
  port: number
  host: string
  isDevelopment: boolean
  isHttpMode: boolean
}

interface ServerInfo {
  address: string
  port: number
}

/**
 * 実行環境を判定するユーティリティ
 */
/** Node.js環境かどうかを判定 */
function isNodejs(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
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
 * サーバー設定を取得する関数（設定モジュールを使用）
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
 * HTTP サーバーを起動する
 */
async function startHttpServer(config: IndexServerConfig): Promise<void> {
  try {
    console.error('Starting HTTP server with config:', config)
    const { default: app } = await import('./http.js')
    console.error('App loaded successfully')

    const { serve } = await import('@hono/node-server')
    console.error('Server module loaded successfully')

    const serverOptions = {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    }

    console.error('Attempting to start server with options:', serverOptions)

    serve(serverOptions, (info: ServerInfo) => {
      console.error(`VOICEVOX MCP HTTP server running at http://${info.address}:${info.port}/mcp`)
      console.error(`Health check: http://${info.address}:${info.port}/health`)
    })

    // サーバー起動の確認を少し待つ
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.error('HTTP server startup completed')
  } catch (error) {
    console.error('HTTP server startup failed:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    }
    throw new Error(`Failed to start HTTP server: ${error}`)
  }
}

/**
 * Stdio サーバーを起動する
 */
async function startStdioServer(_config: IndexServerConfig): Promise<void> {
  try {
    await import('./stdio.js')

    // Stdio サーバーは常に実行中なので、プロセス終了までブロック
    process.on('SIGINT', () => {
      process.exit(0)
    })
  } catch (error) {
    console.error('Stdio server startup failed:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    }
    throw new Error(`Failed to start stdio server: ${error}`)
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
                              (Allowed: speak, ping_voicevox, generate_query, synthesize_file,
                               stop_speaker, get_speakers, get_speaker_detail)

  Server Options:
  --http                      Enable HTTP server mode (remote MCP)
  --port <port>               HTTP server port (default: 3000)
  --host <host>               HTTP server host (default: 0.0.0.0)
  --allowed-hosts <hosts>     Comma-separated list of allowed hosts (default: localhost,127.0.0.1,[::1])
  --allowed-origins <origins> Comma-separated list of allowed origins

Examples:
  npx @kajidog/mcp-tts-voicevox --url http://192.168.1.50:50021 --speaker 3
  npx @kajidog/mcp-tts-voicevox --http --port 8080
  npx @kajidog/mcp-tts-voicevox --disable-tools generate_query,synthesize_file
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

  const config = getServerConfig()

  // HTTPモードの場合のみログを出力
  if (config.isHttpMode) {
    console.error('Environment detection:', {
      isCLI: isCLI(),
      isNpx: isNpx(),
      shouldStart,
      argv1: process.argv[1],
      argv0: process.argv0,
      execPath: process.execPath,
    })

    console.error('Server configuration:', config)
  }

  if (!shouldStart) {
    if (config.isHttpMode) {
      console.error('Running as library, server startup skipped')
    }
    return // ライブラリとして使用されている
  }

  try {
    if (config.isHttpMode) {
      await startHttpServer(config)
    } else {
      await startStdioServer(config)
    }
  } catch (error) {
    console.error('Server startup failed:', error)
    process.exit(1)
  }
}

// Node.js環境での自動起動
if (isNodejs()) {
  startMCPServer().catch((error) => {
    console.error('Initialization error:', error)
    // ライブラリとしての利用に支障がないように、エラーは無視
  })
}
