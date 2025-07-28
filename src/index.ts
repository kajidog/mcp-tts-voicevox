#!/usr/bin/env node
// MCP TTS Voicevox エントリーポイント

// 型定義
interface ServerConfig {
  port: number
  host: string
  isDevelopment: boolean
  isHttpMode: boolean
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

  // 環境変数でHTTPモードが明示的に設定されている場合は強制的にCLI実行として扱う
  const isForceMode = process.env?.MCP_HTTP_MODE === 'true'

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
 * サーバー設定を取得する関数
 */
function getServerConfig(): ServerConfig {
  const env = process.env || {}

  return {
    port: Number.parseInt(env.MCP_HTTP_PORT || '3000', 10),
    host: env.MCP_HTTP_HOST || '0.0.0.0',
    isDevelopment: env.NODE_ENV === 'development',
    isHttpMode: env.MCP_HTTP_MODE === 'true',
  }
}

/**
 * HTTP サーバーのアプリケーションをロードする
 */
async function loadHttpApp(isDevelopment: boolean) {
  if (isDevelopment) {
    const module = await import('./http')
    return module.default
  }
  return require('./http').default
}

/**
 * HTTP サーバーを起動する
 */
async function startHttpServer(config: ServerConfig): Promise<void> {
  try {
    console.error('Starting HTTP server with config:', config)
    const app = await loadHttpApp(config.isDevelopment)
    console.error('Express app loaded successfully')

    const server = app.listen(config.port, config.host, () => {
      console.error(`✅ VOICEVOX MCP HTTP server running at http://${config.host}:${config.port}/mcp`)
      console.error(`🔍 Health check: http://${config.host}:${config.port}/health`)
    })

    // Graceful shutdown handler
    const gracefulShutdown = () => {
      console.error('Shutting down HTTP server...')
      server.close(() => {
        console.error('HTTP server closed')
        process.exit(0)
      })
    }

    process.on('SIGTERM', gracefulShutdown)
    process.on('SIGINT', gracefulShutdown)

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
async function startStdioServer(config: ServerConfig): Promise<void> {
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
