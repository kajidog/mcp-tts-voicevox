import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@kajidog/voicevox-client': path.resolve(__dirname, '../packages/voicevox-client/src/index.ts')
    }
  },
  server: {
    open: '/browser/index.html'
  }
})
