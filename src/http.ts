import { randomUUID } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { type Context, Hono, type Next } from 'hono'
import { cors } from 'hono/cors'

import { getConfig } from './config'
import { server } from './server'
import { deleteSessionConfig, setSessionConfig } from './session'

// 設定を取得
const config = getConfig()

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

/**
 * JSONRPCエラーレスポンスを生成するヘルパー関数
 */
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

function forbiddenError(message: string): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message,
    },
    id: null,
  }
}

/**
 * Origin検証ミドルウェア
 * 設定で許可されたOriginのみ受け入れる
 */
function validateOrigin() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('Origin')

    // Originヘッダーがない場合は許可（same-originリクエスト、CLIツール等）
    if (!origin) {
      return next()
    }

    // Originをパースしてホスト名を取得（ポート番号は無視）
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
 * 設定で許可されたHostのみ受け入れる
 */
function validateHost() {
  return async (c: Context, next: Next) => {
    const host = c.req.header('Host')

    if (!host) {
      return next()
    }

    // ホスト名を取得（ポート番号は除外）
    const hostname = host.includes(':') ? host.split(':')[0] : host

    if (!config.allowedHosts.includes(hostname)) {
      console.log(`Rejected request with invalid Host: ${host} (allowed: ${config.allowedHosts.join(', ')})`)
      return c.json(forbiddenError('Forbidden: Invalid Host header'), { status: 403 })
    }

    return next()
  }
}

// Map to store transports by session ID
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

        // X-Voicevox-Speaker ヘッダーを読み取り
        const speakerHeader = c.req.header('X-Voicevox-Speaker')
        let sessionSpeaker: number | undefined
        if (speakerHeader) {
          const parsed = Number.parseInt(speakerHeader, 10)
          if (!Number.isNaN(parsed) && parsed >= 0) {
            sessionSpeaker = parsed
          }
        }

        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.log(`Session initialized: ${newSessionId}`)
            transports.set(newSessionId, transport)
            // セッションのデフォルト話者を設定
            if (sessionSpeaker !== undefined) {
              setSessionConfig(newSessionId, { defaultSpeaker: sessionSpeaker })
              console.log(`Session ${newSessionId} default speaker: ${sessionSpeaker}`)
            }
          },
        })

        // クリーンアップハンドラー
        transport.onclose = () => {
          const sid = transport.sessionId
          if (sid) {
            console.log(`Transport closed for session: ${sid}`)
            transports.delete(sid)
            deleteSessionConfig(sid)
          }
        }

        // サーバーに接続
        await server.connect(transport)

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

// CORSを設定（公式サンプルに準拠）
app.use(
  '/mcp',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'mcp-session-id', 'Last-Event-ID', 'mcp-protocol-version', 'X-Voicevox-Speaker'],
    exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
  })
)

// セキュリティミドルウェアを適用（MCP仕様2025-11-25準拠）
app.use('/mcp', validateOrigin())
app.use('/mcp', validateHost())

// ルート定義
app.all('/mcp', handleMCP)
app.get('/health', handleHealth)

export default app
