import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { BaseServerConfig } from './config.js'
import { type CreateHttpAppOptions, createHttpApp } from './http.js'
import { connectStdio } from './stdio.js'

/**
 * 実行環境を判定するユーティリティ
 */

/** Node.js環境かどうかを判定 */
export function isNodejs(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

/** Bunランタイムかどうかを判定 */
export function isBun(): boolean {
  return 'Bun' in globalThis
}

// 型定義
interface ServerInfo {
  address: string
  port: number
}

export interface LaunchOptions {
  server: McpServer
  config: BaseServerConfig
  serverName: string
  /** セッションごとに新しい McpServer を生成するファクトリ関数（HTTPモード用） */
  serverFactory?: () => McpServer
  httpOptions?: Omit<CreateHttpAppOptions, 'server' | 'config' | 'serverFactory'>
}

/**
 * HTTP サーバーを起動する
 */
export async function startHttpServer(options: LaunchOptions): Promise<void> {
  const { server, config, serverName, serverFactory, httpOptions = {} } = options

  try {
    console.error(`Starting ${serverName} HTTP server...`)

    const app = createHttpApp({
      server,
      config,
      serverFactory,
      ...httpOptions,
    })

    if (isBun()) {
      // Bun native server
      const bunServer = (globalThis as any).Bun.serve({
        fetch: app.fetch,
        port: config.httpPort,
        hostname: config.httpHost,
      })
      console.error(`${serverName} HTTP server running at http://${bunServer.hostname}:${bunServer.port}/mcp`)
      console.error(`Health check: http://${bunServer.hostname}:${bunServer.port}/health`)
    } else {
      // Node.js: @hono/node-server
      const { serve } = await import('@hono/node-server')

      serve(
        {
          fetch: app.fetch,
          port: config.httpPort,
          hostname: config.httpHost,
        },
        (info: ServerInfo) => {
          console.error(`${serverName} HTTP server running at http://${info.address}:${info.port}/mcp`)
          console.error(`Health check: http://${info.address}:${info.port}/health`)
        }
      )
    }

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
export async function startStdioServer(options: LaunchOptions): Promise<void> {
  try {
    await connectStdio(options.server)

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
 * MCP サーバーを起動する（HTTP/Stdioの自動切り替え）
 */
export async function launchServer(options: LaunchOptions): Promise<void> {
  const { config } = options

  try {
    if (config.httpMode) {
      await startHttpServer(options)
    } else {
      await startStdioServer(options)
    }
  } catch (error) {
    console.error('Server startup failed:', error)
    process.exit(1)
  }
}
