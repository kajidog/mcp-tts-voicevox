#!/usr/bin/env node
// MCP TTS Voicevox エントリーポイント

// 型定義
interface ServerConfig {
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
class EnvironmentDetector {
  /** Node.js環境かどうかを判定 */
  static isNodejs(): boolean {
    return typeof process !== 'undefined' && !!process.versions?.node
  }

  /** CLI実行かどうかを判定 */
  static isCLI(): boolean {
    if (!this.isNodejs() || !process.argv) return false

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
  static isNpx(): boolean {
    if (!this.isNodejs()) return false

    return !!(process.env?.npm_execpath && process.argv[1] && !process.argv[1].includes('node_modules'))
  }
}

/**
 * サーバー設定を管理するクラス
 */
class ServerConfigManager {
  static getConfig(): ServerConfig {
    const env = process.env || {}

    return {
      port: Number.parseInt(env.MCP_HTTP_PORT || '3000', 10),
      host: env.MCP_HTTP_HOST || '0.0.0.0',
      isDevelopment: env.NODE_ENV === 'development',
      isHttpMode: env.MCP_HTTP_MODE === 'true',
    }
  }
}

/**
 * HTTP サーバー管理クラス
 */
class HttpServerManager {
  static async start(config: ServerConfig): Promise<void> {
    try {
      console.error('Starting HTTP server with config:', config)
      const app = await this.loadApp(config.isDevelopment)
      console.error('App loaded successfully')
      const server = await this.loadServer(config.isDevelopment)
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

  private static async loadApp(isDevelopment: boolean) {
    if (isDevelopment) {
      const module = await import('./sse')
      return module.default
    } else {
      return require('./sse').default
    }
  }

  private static async loadServer(isDevelopment: boolean) {
    if (isDevelopment) {
      return await import('@hono/node-server')
    } else {
      return require('@hono/node-server')
    }
  }
}

/**
 * Stdio サーバー管理クラス
 */
class StdioServerManager {
  static async start(config: ServerConfig): Promise<void> {
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
}

/**
 * メインサーバー管理クラス
 */
class MCPServerManager {
  static async start(): Promise<void> {
    // 環境チェック
    if (!EnvironmentDetector.isNodejs()) {
      throw new Error('❌ Node.js environment required')
    }

    // CLI実行またはNPX実行の場合のみサーバーを起動
    const shouldStart = EnvironmentDetector.isCLI() || EnvironmentDetector.isNpx()

    const config = ServerConfigManager.getConfig()

    // HTTPモードの場合のみログを出力
    if (config.isHttpMode) {
      console.error('🔍 Environment detection:', {
        isCLI: EnvironmentDetector.isCLI(),
        isNpx: EnvironmentDetector.isNpx(),
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
        await HttpServerManager.start(config)
      } else {
        await StdioServerManager.start(config)
      }
    } catch (error) {
      console.error('❌ Server startup failed:', error)
      process.exit(1)
    }
  }
}

// Node.js環境での自動起動
if (EnvironmentDetector.isNodejs()) {
  MCPServerManager.start().catch((error) => {
    console.error('Initialization error:', error)
    // ライブラリとしての利用に支障がないように、エラーは無視
  })
}
