#!/usr/bin/env node
// MCP TTS Voicevox エントリーポイント

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNodejs, launchServer, setSessionConfig } from '@kajidog/mcp-core'
import { getConfig, getConfigTemplate, getHelpText } from './config.js'
import { createServer, server } from './server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 型定義
interface IndexServerConfig {
  port: number
  host: string
  isDevelopment: boolean
  isHttpMode: boolean
}

/** CLI実行かどうかを判定 */
function isCLI(): boolean {
  if (!isNodejs() || !process.argv) return false

  const isNpmStart = process.env?.npm_lifecycle_event === 'start'
  const argv1 = process.argv[1] || ''
  const isDirectExecution =
    argv1.includes('mcp-tts-voicevox') ||
    argv1.endsWith('dist/index.js') ||
    argv1.endsWith('src/index.ts') ||
    argv1.includes('index.js') ||
    argv1.includes('npx')

  // 設定からHTTPモードを取得（CLI引数または環境変数）
  const config = getConfig()
  const isForceMode = config.httpMode

  // ESM環境でのメインモジュール判定
  const isMainModule =
    process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv0?.includes('node') ||
    process.argv0?.includes('bun')

  return isNpmStart || isDirectExecution || isForceMode || isMainModule
}

/** NPX経由実行かどうかを判定 */
function isNpx(): boolean {
  if (!isNodejs()) return false

  return !!(process.env?.npm_execpath && process.argv[1] && !process.argv[1].includes('node_modules'))
}

/**
 * サーバー設定を取得する関数
 */
function getServerConfig(): IndexServerConfig {
  const config = getConfig()

  return {
    port: config.httpPort,
    host: config.httpHost,
    isDevelopment: process.env.NODE_ENV === 'development',
    isHttpMode: config.httpMode,
  }
}

/**
 * ヘルプメッセージを表示する（設定定義から自動生成）
 */
function printHelp() {
  console.log(`\n${getHelpText()}`)
}

/**
 * MCP サーバーを起動する
 */
async function startMCPServer(): Promise<void> {
  // 環境チェック
  if (!isNodejs()) {
    throw new Error('Node.js environment required')
  }

  // ヘルプオプションの確認
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  // バージョンオプションの確認
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))
    console.log(`@kajidog/mcp-tts-voicevox v${pkg.version}`)
    process.exit(0)
  }

  // --init: 設定ファイルのテンプレートを生成
  if (process.argv.includes('--init')) {
    const outputPath = join(process.cwd(), '.voicevoxrc.json')
    if (existsSync(outputPath)) {
      console.error('.voicevoxrc.json already exists. Remove it first or edit it directly.')
      process.exit(1)
    }
    const template = getConfigTemplate()
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`)
    console.log('Created .voicevoxrc.json with default settings.')
    console.log('Edit the file to customize your configuration.')
    process.exit(0)
  }

  // CLI実行またはNPX実行の場合のみサーバーを起動
  const shouldStart = isCLI() || isNpx()

  const config = getConfig()
  const serverConfig = getServerConfig()

  // HTTPモードの場合のみログを出力
  if (serverConfig.isHttpMode) {
    console.error('Environment detection:', {
      isCLI: isCLI(),
      isNpx: isNpx(),
      shouldStart,
      argv1: process.argv[1],
      argv0: process.argv0,
      execPath: process.execPath,
    })

    console.error('Server configuration:', serverConfig)
  }

  if (!shouldStart) {
    if (serverConfig.isHttpMode) {
      console.error('Running as library, server startup skipped')
    }
    return // ライブラリとして使用されている
  }

  // mcp-core のランチャーを使用してサーバーを起動
  await launchServer({
    server,
    config,
    serverName: 'VOICEVOX MCP TTS',
    serverFactory: createServer,
    httpOptions: {
      extraCorsHeaders: ['X-Voicevox-Speaker'],
      onSessionInitialized: (sessionId, request) => {
        // X-Voicevox-Speaker ヘッダーからセッションのデフォルト話者を設定
        const speakerHeader = request.headers.get('X-Voicevox-Speaker')
        if (speakerHeader) {
          const parsed = Number.parseInt(speakerHeader, 10)
          if (!Number.isNaN(parsed) && parsed >= 0) {
            setSessionConfig(sessionId, { defaultSpeaker: parsed })
            console.log(`Session ${sessionId} default speaker: ${parsed}`)
          }
        }
      },
    },
  })
}

// Node.js環境での自動起動
if (isNodejs()) {
  startMCPServer().catch((error) => {
    console.error('Initialization error:', error)
    // ライブラリとしての利用に支障がないように、エラーは無視
  })
}
