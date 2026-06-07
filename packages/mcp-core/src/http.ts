import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { type Context, Hono, type Next } from 'hono'
import { cors } from 'hono/cors'

import type { BaseServerConfig } from './config.js'

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
  mode: 'stateless'
  timestamp: string
}

export interface CreateHttpAppOptions {
  config: BaseServerConfig
  /**
   * リクエストごとに新しい McpServer を生成するファクトリ関数（必須）。
   *
   * ステートレスモードでは transport を使い回せず（メッセージID衝突）、
   * 1 つの McpServer を複数 transport へ並行 connect することもできない。
   * そのため毎リクエストで独立したサーバーインスタンスが必要。
   */
  serverFactory: () => McpServer
  /** 追加のCORSヘッダー（例: 'X-Voicevox-Speaker'） */
  extraCorsHeaders?: string[]
}

/**
 * JSONRPCエラーレスポンスを生成するヘルパー関数
 */
function badRequestError(message = 'Bad Request'): ErrorResponse {
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

function unauthorizedError(message: string): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32001, message },
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
 * APIキー検証ミドルウェア
 */
function validateApiKey(config: BaseServerConfig) {
  return async (c: Context, next: Next) => {
    if (!config.apiKey || c.req.method === 'OPTIONS') {
      return next()
    }

    const xApiKey = c.req.header('X-API-Key')
    const authorization = c.req.header('Authorization')
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined
    const providedKey = xApiKey ?? bearerToken

    if (providedKey !== config.apiKey) {
      console.log('Rejected request with invalid API key')
      return c.json(unauthorizedError('Unauthorized: Invalid API key'), { status: 401 })
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
  const { config, serverFactory, extraCorsHeaders = [] } = options

  if (typeof serverFactory !== 'function') {
    throw new Error(
      'createHttpApp requires a serverFactory: stateless HTTP creates an independent McpServer per request'
    )
  }

  /**
   * MCP エンドポイントハンドラー（ステートレス）
   *
   * セッション管理は行わず、1 リクエストを自己完結で処理する。
   * リクエストごとに使い捨ての McpServer + transport を生成する
   * （ステートレス transport は使い回すとメッセージID衝突を起こすため）。
   */
  async function handleMCP(c: Context): Promise<Response> {
    console.log(`Received ${c.req.method} request for MCP`)

    // ステートレスではサーバー起点のSSEストリーム/セッション終了が無いため POST のみ受け付ける
    if (c.req.method !== 'POST') {
      return c.json(badRequestError('Method Not Allowed: stateless mode accepts POST only'), { status: 405 })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(badRequestError('Invalid JSON'), { status: 400 })
    }

    const mcpServer = serverFactory()
    const transport = new WebStandardStreamableHTTPServerTransport({
      // sessionIdGenerator: undefined → ステートレスモード（セッションID無し・検証無し）
      sessionIdGenerator: undefined,
      // 単発のJSONレスポンスを返す（SSEストリームを張らない）
      enableJsonResponse: true,
    })

    try {
      await mcpServer.connect(transport)
      const response = await transport.handleRequest(c.req.raw, { parsedBody: body })

      // 使い捨てインスタンスを後始末（JSONレスポンスはバッファ済みのため安全）
      void mcpServer.close()

      return response
    } catch (e) {
      console.error('MCP connection error:', e)
      void mcpServer.close()
      return c.json(internalServerError(), { status: 500 })
    }
  }

  /**
   * ヘルスチェックエンドポイントハンドラー
   */
  function handleHealth(c: Context): Response {
    const response: HealthCheckResponse = {
      status: 'ok',
      mode: 'stateless',
      timestamp: new Date().toISOString(),
    }
    return c.json(response)
  }

  // アプリケーションのセットアップ
  const app: Hono = new Hono()

  // CORSを設定（ステートレス: mcp-session-id は廃止、ルーティング用ヘッダーを許可）
  const allowHeaders = [
    'Content-Type',
    'Last-Event-ID',
    'mcp-protocol-version',
    'Mcp-Method',
    'Mcp-Name',
    'X-API-Key',
    'Authorization',
    ...extraCorsHeaders,
  ]

  app.use(
    '/mcp',
    cors({
      origin: '*',
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders,
      exposeHeaders: ['mcp-protocol-version'],
    })
  )

  // セキュリティミドルウェアを適用
  app.use('/mcp', validateOrigin(config))
  app.use('/mcp', validateHost(config))
  app.use('/mcp', validateApiKey(config))

  // ルート定義
  app.all('/mcp', handleMCP)
  app.get('/health', handleHealth)

  return app
}
