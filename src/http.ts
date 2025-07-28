import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { server } from './server'

// Express アプリケーションの作成
const app = express()
app.use(express.json())

// CORS設定 - Mcp-Session-Idヘッダーを公開
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
  })
)

// セッションIDごとのトランスポートを管理
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

// MCP StreamableHTTP エンドポイント
app.all('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  console.log(`Received ${req.method} request to /mcp${sessionId ? ` for session: ${sessionId}` : ''}`)

  try {
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports[sessionId]) {
      // 既存のトランスポートを再利用
      transport = transports[sessionId]
    } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
      // 新しい初期化リクエスト
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          console.log(`Session initialized with ID: ${sessionId}`)
          transports[sessionId] = transport
        },
      })

      // クリーンアップハンドラー
      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid && transports[sid]) {
          console.log(`Transport closed for session ${sid}, removing from transports map`)
          delete transports[sid]
        }
      }

      // サーバーに接続
      await server.connect(transport)
    } else {
      // 無効なリクエスト
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      })
      return
    }

    // リクエストを処理
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('Error handling MCP request:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      })
    }
  }
})

// ヘルスチェックエンドポイント
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    transports: {
      streamable: Object.keys(transports).length,
    },
    timestamp: new Date().toISOString(),
  })
})

export default app
