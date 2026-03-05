import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * Tool name prefix for public-facing tools.
 * Internal tools (starting with '_') are not prefixed.
 */
export const TOOL_PREFIX = 'voicevox_'

/**
 * Add the tool prefix to a name.
 * Internal tools (starting with '_') are returned as-is.
 */
export function addToolPrefix(name: string): string {
  if (name.startsWith('_')) {
    return name
  }
  return `${TOOL_PREFIX}${name}`
}

/**
 * Check if a tool is disabled, accepting both prefixed and unprefixed names.
 */
function isToolDisabled(disabledTools: Set<string>, name: string): boolean {
  const fullName = addToolPrefix(name)
  return disabledTools.has(name) || disabledTools.has(fullName)
}

/**
 * Register a tool with auto-prefixed name (disabled tools are skipped).
 *
 * Uses rest args to forward all overload variants of `McpServer.registerTool`
 * without needing to duplicate each generic signature.
 */
export function registerToolIfEnabled(
  server: McpServer,
  disabledTools: Set<string>,
  name: string,
  // biome-ignore lint/suspicious/noExplicitAny: forwarding to McpServer.registerTool which has complex overloaded generic signatures
  ...args: [config: any, cb: any]
) {
  const fullName = addToolPrefix(name)
  if (isToolDisabled(disabledTools, name)) {
    console.error(`Tool "${fullName}" is disabled via configuration`)
    return
  }
  server.registerTool(fullName, ...args)
}

export function registerAppToolIfEnabled(
  server: McpServer,
  disabledTools: Set<string>,
  name: string,
  // biome-ignore lint/suspicious/noExplicitAny: forwarding to registerAppTool which has complex overloaded generic signatures
  ...args: [config: any, cb: any]
) {
  const fullName = addToolPrefix(name)
  if (isToolDisabled(disabledTools, name)) {
    console.error(`Tool "${fullName}" is disabled via configuration`)
    return
  }
  registerAppTool(server, fullName, ...args)
}
