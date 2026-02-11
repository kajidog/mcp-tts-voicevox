import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * 条件付きツール登録（無効化されたツールは登録しない）
 */
export function registerToolIfEnabled(
  server: McpServer,
  disabledTools: Set<string>,
  name: string,
  definition: any,
  handler: any
) {
  if (disabledTools.has(name)) {
    console.error(`Tool "${name}" is disabled via configuration`)
    return
  }
  server.registerTool(name, definition, handler)
}

export function registerAppToolIfEnabled(
  server: McpServer,
  disabledTools: Set<string>,
  name: string,
  definition: any,
  handler: any
) {
  if (disabledTools.has(name)) {
    console.error(`Tool "${name}" is disabled via configuration`)
    return
  }
  registerAppTool(server, name, definition, handler)
}
