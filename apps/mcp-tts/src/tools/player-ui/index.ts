import type { ToolDeps } from '../types.js'
import { createPlayerUIToolContext } from './context.js'
import { registerPlayerDictionaryTools } from './dictionary-tools.js'
import { registerPlayerExportTools } from './export-tools.js'
import { registerPlayerSpeakerTools } from './speaker-tools.js'
import { registerPlayerStateTools } from './state-tools.js'
import { registerPlayerSynthesisTools } from './synthesis-tools.js'
import type { PlayerUIShared } from './types.js'

export type { PlayerUIShared } from './types.js'

export function registerPlayerUITools(deps: ToolDeps, shared: PlayerUIShared): void {
  // Player UI向けの共通依存を1つのコンテキストにまとめる。
  const context = createPlayerUIToolContext(deps, shared)

  // UIから呼ばれるツール群を機能単位で登録。
  registerPlayerSpeakerTools(context)
  registerPlayerStateTools(context)
  registerPlayerSynthesisTools(context)
  registerPlayerDictionaryTools(context)
  registerPlayerExportTools(context)
}
