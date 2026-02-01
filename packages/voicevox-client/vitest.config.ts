import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      // Mock the node-playback-strategy module to prevent loading Node.js-specific modules in tests
      [path.resolve(__dirname, 'src/playback/node-playback-strategy')]: path.resolve(__dirname, 'src/__mocks__/node-playback-strategy.ts'),
      [path.resolve(__dirname, 'src/playback/node-playback-strategy.ts')]: path.resolve(__dirname, 'src/__mocks__/node-playback-strategy.ts'),
    }
  },
})
