import type { VoicevoxApi, VoicevoxClient } from '@kajidog/voicevox-client'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerConfig } from '../config.js'

// ツールハンドラーのextraパラメータ用の型定義
export interface ToolHandlerExtra {
  /** ステートレスHTTP / stdio では未定義。プレイヤー状態のフォールバックキーにのみ使用 */
  sessionId?: string
  /** リクエスト単位のHTTP情報（ヘッダーはすべて小文字キー） */
  requestInfo?: {
    headers?: Record<string, string | string[] | undefined>
  }
}

// 各 register*Tools に渡す共通依存オブジェクト
export interface ToolDeps {
  server: McpServer
  voicevoxClient: VoicevoxClient
  config: ServerConfig
  disabledTools: Set<string>
  restrictions: {
    immediate: boolean
    waitForStart: boolean
    waitForEnd: boolean
  }
}

// Player ツール固有の依存
export interface PlayerToolDeps extends ToolDeps {
  playerVoicevoxApi: VoicevoxApi
}
