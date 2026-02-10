import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      // Mock the node-playback-strategy module to prevent loading Node.js-specific modules in tests
      [resolve(__dirname, 'src/playback/node-playback-strategy')]: resolve(
        __dirname,
        'src/__mocks__/node-playback-strategy.ts'
      ),
      [resolve(__dirname, 'src/playback/node-playback-strategy.ts')]: resolve(
        __dirname,
        'src/__mocks__/node-playback-strategy.ts'
      ),
    },
  },
})
