import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Hono } from 'hono'

import { toFetchResponse, toReqRes } from 'fetch-to-node'
import { server } from './server'

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
  transports: {
    streamable: number
    sse: number
  }
  timestamp: string
}

/**
 * JSONRPCエラーレスポンスを生成するヘルパー関数
 */
function missingSessionIdError(): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32602,
      message: 'Missing sessionId parameter',
    },
    id: null,
  }
}

function sessionNotFoundError(): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'No transport found for sessionId',
    },
    id: null,
  }
}

function badRequestError(message = 'Bad Request: No valid session ID provided'): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message,
    },
    id: null,
  }
}

function internalServerError(): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal server error',
    },
    id: null,
  }
}

function methodNotAllowedError(): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.',
    },
    id: null,
  }
}

/**
 * トランスポートセッション管理クラス
 */
class TransportManager {
  private streamableTransports = new Map<string, StreamableHTTPServerTransport>()
  private sseTransports = new Map<string, SSEServerTransport>()

  /**
   * StreamableHTTPトランスポートの取得または作成
   */
  async getOrCreateStreamableTransport(
    sessionId: string | undefined,
    requestBody: any
  ): Promise<StreamableHTTPServerTransport | null> {
    // 既存セッションの再利用
    if (sessionId && this.streamableTransports.has(sessionId)) {
      console.log(`Reusing existing session: ${sessionId}`)
      return this.streamableTransports.get(sessionId)!
    }

    // 新しいセッションの初期化
    if (!sessionId && requestBody && typeof requestBody === 'object' && requestBody.method === 'initialize') {
      console.log('Creating new StreamableHTTP session')
      return this.createStreamableTransport()
    }

    return null
  }

  /**
   * SSEトランスポートの作成
   */
  async createSSETransport(res: any): Promise<SSEServerTransport> {
    const transport = new SSEServerTransport('/messages', res)

    // セッション管理
    this.sseTransports.set(transport.sessionId, transport)

    // エラーハンドリング
    transport.onerror = console.error.bind(console)

    // クリーンアップ - SSEServerTransportの終了時に処理
    transport.onclose = () => {
      console.log(`SSE connection closed for session: ${transport.sessionId}`)
      this.sseTransports.delete(transport.sessionId)
    }

    // サーバー接続
    await server.connect(transport)

    return transport
  }

  /**
   * SSEトランスポートの取得
   */
  getSSETransport(sessionId: string): SSEServerTransport | undefined {
    return this.sseTransports.get(sessionId)
  }

  /**
   * ヘルスチェック情報の取得
   */
  getHealthInfo(): HealthCheckResponse {
    return {
      status: 'ok',
      transports: {
        streamable: this.streamableTransports.size,
        sse: this.sseTransports.size,
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * StreamableHTTPトランスポートの作成（内部メソッド）
   */
  private createStreamableTransport(): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => {
        const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
        console.log(`Generated new session ID: ${newSessionId}`)
        return newSessionId
      },
      onsessioninitialized: (sessionId) => {
        console.log(`Session initialized: ${sessionId}`)
        this.streamableTransports.set(sessionId, transport)
      },
    })

    // クリーンアップハンドラー
    transport.onclose = () => {
      console.log(`Transport closed for session: ${transport.sessionId}`)
      if (transport.sessionId) {
        this.streamableTransports.delete(transport.sessionId)
      }
    }

    return transport
  }
}

/**
 * ルートハンドラークラス
 */
class RouteHandlers {
  constructor(private transportManager: TransportManager) {}

  /**
   * StreamableHTTP エンドポイントハンドラー
   */
  async handleStreamableHTTP(c: any) {
    console.log(`Received ${c.req.method} request for StreamableHTTP`)

    const { req, res } = toReqRes(c.req.raw)

    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      let body: any = null

      // リクエストボディの取得
      if (c.req.method === 'POST') {
        try {
          body = await c.req.json()
        } catch (e) {
          console.log('No JSON body or invalid JSON')
        }
      }

      // トランスポートの取得または作成
      const transport = await this.transportManager.getOrCreateStreamableTransport(sessionId, body)

      if (!transport) {
        console.log('Invalid request - no session ID and not an initialize request')
        return c.json(badRequestError(), { status: 400 })
      }

      // 新しいトランスポートの場合はサーバーに接続
      if (!sessionId) {
        await server.connect(transport)
      }

      // リクエスト処理
      await transport.handleRequest(req, res, body)
      return toFetchResponse(res)
    } catch (e) {
      console.error('StreamableHTTP connection error:', e)
      return c.json(internalServerError(), { status: 500 })
    }
  }

  /**
   * SSE エンドポイントハンドラー（レガシー）
   */
  async handleSSE(c: any) {
    console.log('Received GET SSE request for SSE connection (legacy)')

    const { res } = toReqRes(c.req.raw)

    try {
      await this.transportManager.createSSETransport(res)
      return toFetchResponse(res)
    } catch (e) {
      console.error('SSE connection error:', e)
      return c.json(internalServerError(), { status: 500 })
    }
  }

  /**
   * SSE メッセージエンドポイントハンドラー（レガシー）
   */
  async handleSSEMessage(c: any) {
    console.log('Received POST message request (legacy SSE)')

    const { req, res } = toReqRes(c.req.raw)
    const sessionId = c.req.query('sessionId')

    if (!sessionId) {
      return c.json(missingSessionIdError(), { status: 400 })
    }

    const transport = this.transportManager.getSSETransport(sessionId)
    if (!transport) {
      return c.json(sessionNotFoundError(), { status: 400 })
    }

    try {
      const body = await c.req.json()
      await transport.handlePostMessage(req, res, body)
      return toFetchResponse(res)
    } catch (e) {
      console.error('Message handling error:', e)
      return c.json(internalServerError(), { status: 500 })
    }
  }

  /**
   * ヘルスチェックエンドポイントハンドラー
   */
  async handleHealth(c: any) {
    return c.json(this.transportManager.getHealthInfo())
  }
}

// アプリケーションのセットアップ
const app: Hono = new Hono()
const transportManager = new TransportManager()
const routeHandlers = new RouteHandlers(transportManager)

// ルート定義
app.all('/mcp', (c) => routeHandlers.handleStreamableHTTP(c))
app.get('/sse', (c) => routeHandlers.handleSSE(c))
app.post('/messages', (c) => routeHandlers.handleSSEMessage(c))
app.get('/health', (c) => routeHandlers.handleHealth(c))

export default app
