import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/stdio.ts'],
  format: ['esm'],
  dts: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  target: 'node18',
  noExternal: ['@kajidog/mcp-core'],
  external: [
    '@kajidog/voicevox-client',
    '@modelcontextprotocol/ext-apps',
    '@modelcontextprotocol/sdk',
    'zod',
    'zod/v4',
  ],
  onSuccess: async () => {
    const src = join('..', '..', 'packages', 'player-ui', 'dist', 'mcp-app.html')
    const dest = join('dist', 'mcp-app.html')
    try {
      cpSync(src, dest)
      console.log('Copied player-ui HTML to dist/mcp-app.html')
    } catch {
      console.warn('Warning: player-ui HTML not found. Build @kajidog/player-ui first.')
    }
  },
})
