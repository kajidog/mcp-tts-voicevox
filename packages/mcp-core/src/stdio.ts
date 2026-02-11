import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

/**
 * Stdio transport でMCPサーバーに接続する
 */
export async function connectStdio(server: McpServer): Promise<void> {
  await server.connect(new StdioServerTransport())
}
