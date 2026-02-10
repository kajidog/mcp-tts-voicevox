import path from 'node:path'
import { defineConfig } from 'vite'

const emptyModulePath = path.resolve(__dirname, 'common/empty-module.ts')
const nodePlaybackStrategyPath = path.resolve(
  __dirname,
  '../packages/voicevox-client/src/playback/node-playback-strategy.ts'
)

export default defineConfig({
  root: 'browser',
  base: '/mcp-tts-voicevox/',
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      // Node.js固有モジュールを外部化（ブラウザでは使用されない）
      external: [
        'fs',
        'path',
        'os',
        'child_process',
        'process',
        'node:fs',
        'node:fs/promises',
        'node:path',
        'node:os',
        'node:child_process',
      ],
    },
  },
  resolve: {
    alias: {
      '@kajidog/voicevox-client': path.resolve(__dirname, '../packages/voicevox-client/src/index.ts'),
      // Node.js固有のnode-playback-strategyをブラウザ用に空モジュールで置換
      [nodePlaybackStrategyPath]: emptyModulePath,
      './node-playback-strategy.js': emptyModulePath,
      './node-playback-strategy': emptyModulePath,
    },
  },
  define: {
    // process.envをブラウザで使えるように定義
    'process.env': {},
  },
})
