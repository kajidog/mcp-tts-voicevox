import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerAppToolIfEnabled } from '../registration.js'
import type { ToolDeps } from '../types.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerRuntime } from './runtime.js'
import { playerResourceUri } from './runtime.js'

export function registerOpenDictionaryUITool(deps: ToolDeps, runtime: PlayerRuntime): void {
  const { server, disabledTools } = deps

  registerAppToolIfEnabled(
    server,
    disabledTools,
    'open_dictionary_ui',
    {
      title: 'Open Dictionary UI',
      description: 'Open the user dictionary manager UI for VOICEVOX.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: playerResourceUri } },
    },
    async (): Promise<CallToolResult> => {
      try {
        const words = await runtime.getUserDictionaryWords()
        // 「Dictionary manager opened」はプレーヤーUIとの契約。UIはこのテキストで
        // 辞書モードを判定し、_get_user_dictionary_for_player で単語一覧を取得する。
        return {
          content: [{ type: 'text', text: `Dictionary manager opened. ${words.length} word(s).` }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
