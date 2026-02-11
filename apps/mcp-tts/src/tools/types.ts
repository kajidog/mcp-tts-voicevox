import type { VoicevoxApi, VoicevoxClient } from '@kajidog/voicevox-client'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerConfig } from '../config.js'

// ツールハンドラーのextraパラメータ用の型定義
export interface ToolHandlerExtra {
  sessionId?: string
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
