/**
 * MCP TTS VOICEVOX 設定モジュール
 *
 * 優先順位: CLI引数 > 環境変数 > デフォルト値
 */

import {
  type BaseServerConfig,
  defaultBaseConfig,
  filterUndefined,
  parseBaseCliArgs,
  parseBaseEnvVars,
} from '@kajidog/mcp-core'

// 設定型定義（BaseServerConfigを拡張）
export interface ServerConfig extends BaseServerConfig {
  // VOICEVOX設定
  voicevoxUrl: string
  defaultSpeaker: number
  defaultSpeedScale: number
  useStreaming?: boolean

  // 再生オプションのデフォルト
  defaultImmediate: boolean
  defaultWaitForStart: boolean
  defaultWaitForEnd: boolean

  // 制限設定（AIがオプションを指定できなくする）
  restrictImmediate: boolean
  restrictWaitForStart: boolean
  restrictWaitForEnd: boolean

  // 無効化ツール
  disabledTools: string[]
}

// デフォルト設定
const defaultConfig: ServerConfig = {
  ...defaultBaseConfig,
  voicevoxUrl: 'http://localhost:50021',
  defaultSpeaker: 1,
  defaultSpeedScale: 1.0,
  useStreaming: undefined,
  defaultImmediate: true,
  defaultWaitForStart: false,
  defaultWaitForEnd: false,
  restrictImmediate: false,
  restrictWaitForStart: false,
  restrictWaitForEnd: false,
  disabledTools: [],
}

/**
 * CLI引数をパースする
 */
export function parseCliArgs(argv: string[] = process.argv.slice(2)): Partial<ServerConfig> {
  // まず基本設定（HTTP関連）をパース
  const baseConfig = parseBaseCliArgs(argv)
  const config: Partial<ServerConfig> = { ...baseConfig }

  // VOICEVOX固有の設定をパース
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const nextArg = argv[i + 1]

    switch (arg) {
      case '--url':
        if (nextArg && !nextArg.startsWith('-')) {
          config.voicevoxUrl = nextArg
          i++
        }
        break
      case '--speaker':
        if (nextArg && !nextArg.startsWith('-')) {
          config.defaultSpeaker = Number(nextArg)
          i++
        }
        break
      case '--speed':
        if (nextArg && !nextArg.startsWith('-')) {
          config.defaultSpeedScale = Number(nextArg)
          i++
        }
        break
      case '--use-streaming':
        config.useStreaming = true
        break
      case '--no-use-streaming':
        config.useStreaming = false
        break
      case '--immediate':
        config.defaultImmediate = true
        break
      case '--no-immediate':
        config.defaultImmediate = false
        break
      case '--wait-for-start':
        config.defaultWaitForStart = true
        break
      case '--no-wait-for-start':
        config.defaultWaitForStart = false
        break
      case '--wait-for-end':
        config.defaultWaitForEnd = true
        break
      case '--no-wait-for-end':
        config.defaultWaitForEnd = false
        break
      case '--restrict-immediate':
        config.restrictImmediate = true
        break
      case '--restrict-wait-for-start':
        config.restrictWaitForStart = true
        break
      case '--restrict-wait-for-end':
        config.restrictWaitForEnd = true
        break
      case '--disable-tools':
        if (nextArg && !nextArg.startsWith('-')) {
          config.disabledTools = nextArg.split(',').map((t) => t.trim())
          i++
        }
        break
    }
  }

  return config
}

/**
 * 環境変数から設定を読み込む
 */
export function parseEnvVars(env: NodeJS.ProcessEnv = process.env): Partial<ServerConfig> {
  // まず基本設定（HTTP関連）をパース
  const baseConfig = parseBaseEnvVars(env)
  const config: Partial<ServerConfig> = { ...baseConfig }

  if (env.VOICEVOX_URL) {
    config.voicevoxUrl = env.VOICEVOX_URL
  }

  if (env.VOICEVOX_DEFAULT_SPEAKER) {
    config.defaultSpeaker = Number(env.VOICEVOX_DEFAULT_SPEAKER)
  }

  if (env.VOICEVOX_DEFAULT_SPEED_SCALE) {
    config.defaultSpeedScale = Number(env.VOICEVOX_DEFAULT_SPEED_SCALE)
  }

  if (env.VOICEVOX_USE_STREAMING !== undefined) {
    config.useStreaming = env.VOICEVOX_USE_STREAMING === 'true'
  }

  // immediate は 'false' 以外は true（既存の動作を維持）
  if (env.VOICEVOX_DEFAULT_IMMEDIATE !== undefined) {
    config.defaultImmediate = env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
  }

  if (env.VOICEVOX_DEFAULT_WAIT_FOR_START === 'true') {
    config.defaultWaitForStart = true
  }

  if (env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true') {
    config.defaultWaitForEnd = true
  }

  if (env.VOICEVOX_RESTRICT_IMMEDIATE === 'true') {
    config.restrictImmediate = true
  }

  if (env.VOICEVOX_RESTRICT_WAIT_FOR_START === 'true') {
    config.restrictWaitForStart = true
  }

  if (env.VOICEVOX_RESTRICT_WAIT_FOR_END === 'true') {
    config.restrictWaitForEnd = true
  }

  if (env.VOICEVOX_DISABLED_TOOLS) {
    config.disabledTools = env.VOICEVOX_DISABLED_TOOLS.split(',').map((t) => t.trim())
  }

  return config
}

/**
 * 設定を取得する（優先順位: CLI引数 > 環境変数 > デフォルト値）
 */
export function getConfig(argv?: string[], env?: NodeJS.ProcessEnv): ServerConfig {
  const cliConfig = parseCliArgs(argv)
  const envConfig = parseEnvVars(env)

  return {
    ...defaultConfig,
    ...filterUndefined(envConfig),
    ...filterUndefined(cliConfig),
  }
}

// シングルトンとしてエクスポート（キャッシュ）
let cachedConfig: ServerConfig | null = null

/**
 * キャッシュされた設定を取得する
 */
export function getCachedConfig(): ServerConfig {
  if (!cachedConfig) {
    cachedConfig = getConfig()
  }
  return cachedConfig
}

/**
 * キャッシュをリセットする（テスト用）
 */
export function resetConfigCache(): void {
  cachedConfig = null
}
