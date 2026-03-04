import { registerPlayerUITools } from '../player-ui-tools.js'
import type { ToolDeps } from '../types.js'
import { registerGetPlayerStateTool } from './get-player-state-tool.js'
import { registerOpenDictionaryUITool } from './open-dictionary-ui-tool.js'
import { registerPlayerResource } from './resource.js'
import { registerResynthesizePlayerTool } from './resynthesize-player-tool.js'
import { createPlayerRuntime, playerResourceUri } from './runtime.js'
import { registerSpeakPlayerTool } from './speak-player-tool.js'

export function registerPlayerTools(deps: ToolDeps): void {
  // Player関連の共有依存（APIクライアント、キャッシュ、スピーカー解決）を集約。
  const runtime = createPlayerRuntime(deps)

  // UIリソースと公開ツールを登録。
  registerPlayerResource(deps)
  registerOpenDictionaryUITool(deps, runtime)
  registerSpeakPlayerTool(deps, runtime)
  registerResynthesizePlayerTool(deps, runtime)

  // App UI専用の内部ツール群に shared 依存を注入する。
  registerPlayerUITools(deps, {
    playerVoicevoxApi: runtime.playerVoicevoxApi,
    playerResourceUri,
    synthesizeWithCache: runtime.synthesizeWithCache,
    setSessionState: runtime.setSessionState,
    getSessionState: runtime.getSessionStateByKey,
    getSpeakerList: runtime.getSpeakerList,
  })

  // AIから参照する読み取り専用状態取得ツール。
  registerGetPlayerStateTool(deps, runtime)
}
