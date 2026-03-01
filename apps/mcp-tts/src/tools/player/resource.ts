import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import type { ToolDeps } from '../types.js'
import { playerResourceUri } from './runtime.js'

const __dirname =
  typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url))

function loadPlayerHtml(): string {
  try {
    // 本番ビルド: dist 配下に同梱された HTML を読む。
    const htmlPath = join(__dirname, 'mcp-app.html')
    return readFileSync(htmlPath, 'utf-8')
  } catch {
    try {
      // 開発時: node_modules の player-ui ビルド成果物を参照する。
      const htmlPath = join(__dirname, '..', '..', 'node_modules', '@kajidog', 'player-ui', 'dist', 'mcp-app.html')
      return readFileSync(htmlPath, 'utf-8')
    } catch {
      console.error('Warning: player-ui HTML not found. Please build @kajidog/player-ui first.')
      // UIが見つからない場合でもサーバー起動を止めないため、最小HTMLを返す。
      return '<html><body><p>Player UI not available. Please build @kajidog/player-ui.</p></body></html>'
    }
  }
}

const playerHtml = loadPlayerHtml()

export function registerPlayerResource(deps: ToolDeps): void {
  const { server, config } = deps
  registerAppResource(
    server,
    'VOICEVOX Player',
    playerResourceUri,
    {
      description: 'Audio player UI for VOICEVOX TTS',
      mimeType: RESOURCE_MIME_TYPE,
    },
    async (): Promise<ReadResourceResult> => ({
      contents: [
        {
          uri: playerResourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: playerHtml,
          _meta: {
            ui: {
              csp: {},
              ...(config.playerDomain ? { domain: config.playerDomain } : {}),
            },
          },
        },
      ],
    })
  )
}
