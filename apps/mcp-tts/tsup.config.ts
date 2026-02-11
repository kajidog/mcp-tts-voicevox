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
  external: ['@kajidog/voicevox-client', '@modelcontextprotocol/sdk', 'zod', 'zod/v4'],
})
