import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { type Context, Hono, type Next } from 'hono'
import { cors } from 'hono/cors'

import type { BaseServerConfig } from './config.js'
import { deleteSessionConfig } from './session.js'

// 型定義
interface ErrorResponse {
  jsonrpc: '2.0'
  error: {
    code: number
    message: string
  }
  id: null
}

interface HealthCheckResponse {
  status: 'ok'
  transports: number
  timestamp: string
}

export interface CreateHttpAppOptions {
  server: McpServer
  config: BaseServerConfig
  /** セッションごとに新しい McpServer を生成するファクトリ関数（HTTPモード用） */
  serverFactory?: () => McpServer
  /** 追加のCORSヘッダー（例: 'X-Voicevox-Speaker'） */
  extraCorsHeaders?: string[]
  /** セッション初期化時のコールバック（ヘッダーからの設定読み取り等に使用） */
  onSessionInitialized?: (sessionId: string, request: Request) => void
  /** セッション終了時のコールバック */
  onSessionClosed?: (sessionId: string) => void
}

/**
 * JSONRPCエラーレスポンスを生成するヘルパー関数
 */
function badRequestError(message = 'Bad Request: No valid session ID provided'): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  }
}

function internalServerError(): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
    id: null,
  }
}

function forbiddenError(message: string): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  }
}

/**
 * Origin検証ミドルウェア
 */
function validateOrigin(config: BaseServerConfig) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('Origin')

    if (!origin) {
      return next()
    }

    try {
      const originUrl = new URL(origin)
      const originWithoutPort = `${originUrl.protocol}//${originUrl.hostname}`

      const isAllowed = config.allowedOrigins.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed)
          return originWithoutPort === `${allowedUrl.protocol}//${allowedUrl.hostname}`
        } catch {
          return false
        }
      })

      if (!isAllowed) {
        console.log(`Rejected request with invalid Origin: ${origin} (allowed: ${config.allowedOrigins.join(', ')})`)
        return c.json(forbiddenError('Forbidden: Invalid Origin header'), { status: 403 })
      }
    } catch {
      console.log(`Rejected request with malformed Origin: ${origin}`)
      return c.json(forbiddenError('Forbidden: Malformed Origin header'), { status: 403 })
    }

    return next()
  }
}

/**
 * Host検証ミドルウェア
 */
function validateHost(config: BaseServerConfig) {
  return async (c: Context, next: Next) => {
    const host = c.req.header('Host')

    if (!host) {
      return next()
    }

    const hostname = host.includes(':') ? host.split(':')[0] : host

    if (!config.allowedHosts.includes(hostname)) {
      console.log(`Rejected request with invalid Host: ${host} (allowed: ${config.allowedHosts.join(', ')})`)
      return c.json(forbiddenError('Forbidden: Invalid Host header'), { status: 403 })
    }

    return next()
  }
}

/**
 * MCP HTTP アプリケーションを作成する
 *
 * @param options - HTTPアプリの設定オプション
 * @returns 設定済みのHonoアプリケーション
 */
export function createHttpApp(options: CreateHttpAppOptions): Hono {
  const { server, config, serverFactory, extraCorsHeaders = [], onSessionInitialized, onSessionClosed } = options

  // セッションごとのtransportを管理
  const transports: Map<string, WebStandardStreamableHTTPServerTransport> = new Map()

  /**
   * MCP エンドポイントハンドラー
   */
  async function handleMCP(c: Context): Promise<Response> {
    console.log(`Received ${c.req.method} request for MCP`)

    const sessionId = c.req.header('mcp-session-id')

    try {
      // 既存セッションの再利用
      if (sessionId && transports.has(sessionId)) {
        console.log(`Reusing existing session: ${sessionId}`)
        const transport = transports.get(sessionId)!
        return transport.handleRequest(c.req.raw)
      }

      // 新しいセッションの初期化（POSTリクエストのみ）
      if (c.req.method === 'POST') {
        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          return c.json(badRequestError('Invalid JSON'), { status: 400 })
        }

        // initializeリクエストの場合のみ新しいtransportを作成
        if (isInitializeRequest(body)) {
          console.log('Creating new WebStandard session')

          // コールバック用にリクエストを保持
          const rawRequest = c.req.raw

          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              console.log(`Session initialized: ${newSessionId}`)
              transports.set(newSessionId, transport)

              // アプリ固有の初期化処理
              onSessionInitialized?.(newSessionId, rawRequest)
            },
          })

          // クリーンアップハンドラー
          transport.onclose = () => {
            const sid = transport.sessionId
            if (sid) {
              console.log(`Transport closed for session: ${sid}`)
              transports.delete(sid)
              deleteSessionConfig(sid)

              // アプリ固有のクリーンアップ処理
              onSessionClosed?.(sid)
            }
          }

          // セッションごとに新しいサーバーインスタンスを使用
          const sessionServer = serverFactory ? serverFactory() : server
          await sessionServer.connect(transport)

          // リクエスト処理（parsedBodyを渡す）
          return transport.handleRequest(c.req.raw, { parsedBody: body })
        }
      }

      // セッションIDがなく、initializeリクエストでもない場合
      console.log('Invalid request - no session ID and not an initialize request')
      return c.json(badRequestError(), { status: 400 })
    } catch (e) {
      console.error('MCP connection error:', e)
      return c.json(internalServerError(), { status: 500 })
    }
  }

  /**
   * ヘルスチェックエンドポイントハンドラー
   */
  function handleHealth(c: Context): Response {
    const response: HealthCheckResponse = {
      status: 'ok',
      transports: transports.size,
      timestamp: new Date().toISOString(),
    }
    return c.json(response)
  }

  // アプリケーションのセットアップ
  const app: Hono = new Hono()

  // CORSを設定
  const allowHeaders = [
    'Content-Type',
    'mcp-session-id',
    'Last-Event-ID',
    'mcp-protocol-version',
    ...extraCorsHeaders,
  ]

  app.use(
    '/mcp',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders,
      exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
    })
  )

  // セキュリティミドルウェアを適用
  app.use('/mcp', validateOrigin(config))
  app.use('/mcp', validateHost(config))

  // ルート定義
  app.all('/mcp', handleMCP)
  app.get('/health', handleHealth)

  return app
}
