import { VoicevoxClient } from '@kajidog/voicevox-client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getConfig } from './config.js'
import { registerPlayerTools } from './tools/player.js'
import { registerSpeakTool } from './tools/speak.js'
import { registerSpeakerTools } from './tools/speakers.js'
import { registerSynthesizeTool } from './tools/synthesize.js'
import type { ToolDeps } from './tools/types.js'

// 設定を取得
const config = getConfig()

/**
 * McpServer を作成しツールを登録するファクトリ関数
 * HTTPモードではセッションごとに新しいインスタンスが必要
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'mcp-tts-voicevox',
    version: '0.6.2',
    description: 'A Voicevox server that converts text to speech for playback and saving.',
  })

  // Voicevoxクライアント初期化
  const voicevoxClient = new VoicevoxClient({
    url: config.voicevoxUrl,
    defaultSpeaker: config.defaultSpeaker,
    defaultSpeedScale: config.defaultSpeedScale,
    useStreaming: config.useStreaming,
  })

  // 共通依存オブジェクト
  const deps: ToolDeps = {
    server,
    voicevoxClient,
    config,
    disabledTools: new Set(config.disabledTools),
    restrictions: {
      immediate: config.restrictImmediate,
      waitForStart: config.restrictWaitForStart,
      waitForEnd: config.restrictWaitForEnd,
    },
  }

  // ツール登録
  registerSpeakerTools(deps)
  registerSpeakTool(deps)
  registerSynthesizeTool(deps)
  registerPlayerTools(deps)

  return server
}

// 後方互換性のためのデフォルトインスタンス（stdio用）
export const server = createServer()

// 設定エクスポート（テスト用）
export { config }
