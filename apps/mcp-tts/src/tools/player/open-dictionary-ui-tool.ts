import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerAppToolIfEnabled } from '../registration.js'
import type { ToolDeps } from '../types.js'
import { createErrorResponse } from '../utils.js'
import { playerResourceUri } from './runtime.js'
import type { PlayerRuntime } from './runtime.js'

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
        const notice = '辞書変更は既存トラックに自動反映されません。Playerで再生成すると反映されます。'
        return {
          content: [{ type: 'text', text: `Dictionary manager opened. ${words.length} word(s).` }],
          structuredContent: {
            mode: 'dictionary',
            dictionaryWords: words,
            dictionaryNotice: notice,
          },
          _meta: {
            mode: 'dictionary',
            dictionaryWords: words,
            dictionaryNotice: notice,
          },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
