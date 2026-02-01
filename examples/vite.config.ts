import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: 'browser',
  base: '/mcp-tts-voicevox/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Node.js固有モジュールを外部化（ブラウザでは使用されない）
      external: ['fs', 'path', 'os', 'child_process', 'process'],
    },
  },
  resolve: {
    alias: {
      '@kajidog/voicevox-client': path.resolve(__dirname, '../packages/voicevox-client/src/index.ts'),
      // Node.js固有のplayback-strategyをブラウザ用に空モジュールで置換
      './node-playback-strategy': path.resolve(__dirname, 'common/empty-module.ts'),
    }
  },
  define: {
    // process.envをブラウザで使えるように定義
    'process.env': {},
  },
})
