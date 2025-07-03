import { Hono } from "hono";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { toFetchResponse, toReqRes } from "fetch-to-node";
import { server } from "./server";
import { logger } from "./utils/logger";

// 型定義
interface ErrorResponse {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
  };
  id: null;
}

interface HealthCheckResponse {
  status: "ok";
  transports: {
    streamable: number;
    sse: number;
  };
  timestamp: string;
}

/**
 * JSONRPCエラーレスポンスを生成するヘルパー関数
 */
class ErrorResponseBuilder {
  static missingSessionId(): ErrorResponse {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message: "Missing sessionId parameter",
      },
      id: null,
    };
  }

  static sessionNotFound(): ErrorResponse {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "No transport found for sessionId",
      },
      id: null,
    };
  }

  static badRequest(
    message: string = "Bad Request: No valid session ID provided"
  ): ErrorResponse {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message,
      },
      id: null,
    };
  }

  static internalError(): ErrorResponse {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error",
      },
      id: null,
    };
  }

  static methodNotAllowed(): ErrorResponse {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    };
  }
}

/**
 * トランスポートセッション管理クラス
 */
class TransportManager {
  private streamableTransports = new Map<
    string,
    StreamableHTTPServerTransport
  >();
  private sseTransports = new Map<string, SSEServerTransport>();

  /**
   * StreamableHTTPトランスポートの取得または作成
   */
  async getOrCreateStreamableTransport(
    sessionId: string | undefined,
    requestBody: any
  ): Promise<StreamableHTTPServerTransport | null> {
    // 既存セッションの再利用
    if (sessionId && this.streamableTransports.has(sessionId)) {
      logger.debug(`Reusing existing session: ${sessionId}`);
      return this.streamableTransports.get(sessionId)!;
    }

    // 新しいセッションの初期化
    if (
      !sessionId &&
      requestBody &&
      typeof requestBody === "object" &&
      requestBody.method === "initialize"
    ) {
      logger.debug("Creating new StreamableHTTP session");
      return this.createStreamableTransport();
    }

    return null;
  }

  /**
   * SSEトランスポートの作成
   */
  async createSSETransport(res: any): Promise<SSEServerTransport> {
    const transport = new SSEServerTransport("/messages", res);

    // セッション管理
    this.sseTransports.set(transport.sessionId, transport);

    // エラーハンドリング
    transport.onerror = (error: any) => logger.error("SSE transport error:", { error });

    // クリーンアップ - SSEServerTransportの終了時に処理
    transport.onclose = () => {
      logger.debug(`SSE connection closed for session: ${transport.sessionId}`);
      this.sseTransports.delete(transport.sessionId);
    };

    // サーバー接続
    await server.connect(transport);

    return transport;
  }

  /**
   * SSEトランスポートの取得
   */
  getSSETransport(sessionId: string): SSEServerTransport | undefined {
    return this.sseTransports.get(sessionId);
  }

  /**
   * ヘルスチェック情報の取得
   */
  getHealthInfo(): HealthCheckResponse {
    return {
      status: "ok",
      transports: {
        streamable: this.streamableTransports.size,
        sse: this.sseTransports.size,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * StreamableHTTPトランスポートの作成（内部メソッド）
   */
  private createStreamableTransport(): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => {
        const newSessionId = `session-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}`;
        logger.debug(`Generated new session ID: ${newSessionId}`);
        return newSessionId;
      },
      onsessioninitialized: (sessionId) => {
        logger.debug(`Session initialized: ${sessionId}`);
        this.streamableTransports.set(sessionId, transport);
      },
    });

    // クリーンアップハンドラー
    transport.onclose = () => {
      logger.debug(`Transport closed for session: ${transport.sessionId}`);
      if (transport.sessionId) {
        this.streamableTransports.delete(transport.sessionId);
      }
    };

    return transport;
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
    logger.debug(`Received ${c.req.method} request for StreamableHTTP`);

    const { req, res } = toReqRes(c.req.raw);

    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let body: any = null;

      // リクエストボディの取得
      if (c.req.method === "POST") {
        try {
          body = await c.req.json();
        } catch (e) {
          logger.debug("No JSON body or invalid JSON");
        }
      }

      // トランスポートの取得または作成
      const transport =
        await this.transportManager.getOrCreateStreamableTransport(
          sessionId,
          body
        );

      if (!transport) {
        logger.debug(
          "Invalid request - no session ID and not an initialize request"
        );
        return c.json(ErrorResponseBuilder.badRequest(), { status: 400 });
      }

      // 新しいトランスポートの場合はサーバーに接続
      if (!sessionId) {
        await server.connect(transport);
      }

      // リクエスト処理
      await transport.handleRequest(req, res, body);
      return toFetchResponse(res);
    } catch (e) {
      logger.error("StreamableHTTP connection error:", { error: e });
      return c.json(ErrorResponseBuilder.internalError(), { status: 500 });
    }
  }

  /**
   * SSE エンドポイントハンドラー（レガシー）
   */
  async handleSSE(c: any) {
    logger.debug("Received GET SSE request for SSE connection (legacy)");

    const { res } = toReqRes(c.req.raw);

    try {
      await this.transportManager.createSSETransport(res);
      return toFetchResponse(res);
    } catch (e) {
      logger.error("SSE connection error:", { error: e });
      return c.json(ErrorResponseBuilder.internalError(), { status: 500 });
    }
  }

  /**
   * SSE メッセージエンドポイントハンドラー（レガシー）
   */
  async handleSSEMessage(c: any) {
    logger.debug("Received POST message request (legacy SSE)");

    const { req, res } = toReqRes(c.req.raw);
    const sessionId = c.req.query("sessionId");

    if (!sessionId) {
      return c.json(ErrorResponseBuilder.missingSessionId(), { status: 400 });
    }

    const transport = this.transportManager.getSSETransport(sessionId);
    if (!transport) {
      return c.json(ErrorResponseBuilder.sessionNotFound(), { status: 400 });
    }

    try {
      const body = await c.req.json();
      await transport.handlePostMessage(req, res, body);
      return toFetchResponse(res);
    } catch (e) {
      logger.error("Message handling error:", { error: e });
      return c.json(ErrorResponseBuilder.internalError(), { status: 500 });
    }
  }

  /**
   * ヘルスチェックエンドポイントハンドラー
   */
  async handleHealth(c: any) {
    return c.json(this.transportManager.getHealthInfo());
  }
}

// アプリケーションのセットアップ
const app = new Hono();
const transportManager = new TransportManager();
const routeHandlers = new RouteHandlers(transportManager);

// ルート定義
app.all("/mcp", (c) => routeHandlers.handleStreamableHTTP(c));
app.get("/sse", (c) => routeHandlers.handleSSE(c));
app.post("/messages", (c) => routeHandlers.handleSSEMessage(c));
app.get("/health", (c) => routeHandlers.handleHealth(c));

export default app;
