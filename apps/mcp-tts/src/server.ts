import { VoicevoxClient } from '@kajidog/voicevox-client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getConfig } from './config.js'
import { expandGroups } from './tool-groups.js'
import { registerDictionaryTools } from './tools/dictionary.js'
import { registerPlayerTools } from './tools/player.js'
import { registerSpeakTool } from './tools/speak.js'
import { registerSpeakerTools } from './tools/speakers.js'
import { registerSynthesizeTool } from './tools/synthesize.js'
import type { ToolDeps } from './tools/types.js'

// 設定を取得
const config = getConfig()

/**
 * VoicevoxClient はプロセス内で 1 つだけ持つ。
 *
 * ステートレス HTTP モードでは createServer() がリクエストごとに呼ばれるため、
 * ここでクライアントを作ってしまうと speak を実行した QueueService と
 * stop_speaker が触る QueueService が別インスタンスになり、再生を止められない。
 * 再生キュー・再生中プロセスはプロセス単位の状態なので、client も
 * プロセス単位で共有する。
 */
let sharedClient: VoicevoxClient | null = null

export function getVoicevoxClient(): VoicevoxClient {
  if (!sharedClient) {
    sharedClient = new VoicevoxClient({
      url: config.voicevoxUrl,
      defaultSpeaker: config.defaultSpeaker,
      defaultSpeedScale: config.defaultSpeedScale,
      retryCount: config.retryCount,
      retryDelayMs: config.retryDelayMs,
      timeoutMs: config.timeoutMs,
      useStreaming: config.useStreaming,
      defaultPostPhonemeLength: config.defaultPostPhonemeLength,
    })
  }
  return sharedClient
}

/**
 * 共有クライアントを破棄する（テスト用）
 */
export function resetVoicevoxClient(): void {
  sharedClient = null
}

/**
 * McpServer を作成しツールを登録するファクトリ関数
 * HTTPモードではリクエストごとに新しい McpServer が必要だが、
 * VoicevoxClient（＝再生キュー）は共有インスタンスを使う。
 *
 * @param voicevoxClient テスト用に差し替える場合のみ指定する
 */
export function createServer(voicevoxClient: VoicevoxClient = getVoicevoxClient()): McpServer {
  const server = new McpServer({
    name: 'mcp-tts-voicevox',
    version: '0.8.1',
    description: 'A Voicevox server that converts text to speech for playback and saving.',
  })

  // 共通依存オブジェクト
  const deps: ToolDeps = {
    server,
    voicevoxClient,
    config,
    disabledTools: new Set([...config.disabledTools, ...expandGroups(config.disabledGroups ?? [])]),
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
  registerDictionaryTools(deps)
  registerPlayerTools(deps)

  return server
}

// 後方互換性のためのデフォルトインスタンス（stdio用）
export const server = createServer()

// 設定エクスポート（テスト用）
export { config }
