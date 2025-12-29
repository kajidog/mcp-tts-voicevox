#!/usr/bin/env node
// MCP TTS Voicevox エントリーポイント

import { getConfig } from './config'

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

  // npxやCLIからの直接実行を検出
  const isMainModule = require.main === module || process.argv0.includes('node')

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
 * HTTP サーバーのアプリケーションをロードする
 */
async function loadHttpApp(isDevelopment: boolean) {
  if (isDevelopment) {
    const module = await import('./sse')
    return module.default
  }
  return require('./sse').default
}

/**
 * HTTP サーバーモジュールをロードする
 */
async function loadHttpServer(isDevelopment: boolean) {
  if (isDevelopment) {
    return await import('@hono/node-server')
  }
  return require('@hono/node-server')
}

/**
 * HTTP サーバーを起動する
 */
async function startHttpServer(config: IndexServerConfig): Promise<void> {
  try {
    console.error('Starting HTTP server with config:', config)
    const app = await loadHttpApp(config.isDevelopment)
    console.error('App loaded successfully')
    const server = await loadHttpServer(config.isDevelopment)
    console.error('Server module loaded successfully')

    const serverOptions = {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    }

    console.error('Attempting to start server with options:', serverOptions)

    server.serve(serverOptions, (info: ServerInfo) => {
      console.error(`✅ VOICEVOX MCP HTTP server running at http://${info.address}:${info.port}/mcp`)
      console.error(`📡 SSE endpoint (legacy): http://${info.address}:${info.port}/sse`)
      console.error(`🔍 Health check: http://${info.address}:${info.port}/health`)
    })

    // サーバー起動の確認を少し待つ
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.error('HTTP server startup completed')
  } catch (error) {
    console.error('❌ HTTP server startup failed:', error)
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
async function startStdioServer(config: IndexServerConfig): Promise<void> {
  try {
    if (config.isDevelopment) {
      await import('./stdio')
    } else {
      require('./stdio')
    }

    // Stdio サーバーは常に実行中なので、プロセス終了までブロック
    process.on('SIGINT', () => {
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ Stdio server startup failed:', error)
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
 * MCP サーバーを起動する
 */
async function startMCPServer(): Promise<void> {
  // 環境チェック
  if (!isNodejs()) {
    throw new Error('❌ Node.js environment required')
  }

  // CLI実行またはNPX実行の場合のみサーバーを起動
  const shouldStart = isCLI() || isNpx()

  const config = getServerConfig()

  // HTTPモードの場合のみログを出力
  if (config.isHttpMode) {
    console.error('🔍 Environment detection:', {
      isCLI: isCLI(),
      isNpx: isNpx(),
      shouldStart,
      argv1: process.argv[1],
      argv0: process.argv0,
      execPath: process.execPath,
    })

    console.error('⚙️ Server configuration:', config)
  }

  if (!shouldStart) {
    if (config.isHttpMode) {
      console.error('📚 Running as library, server startup skipped')
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
    console.error('❌ Server startup failed:', error)
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
