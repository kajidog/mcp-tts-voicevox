/**
 * MCP TTS VOICEVOX 設定モジュール
 *
 * 優先順位: CLI引数 > 環境変数 > 設定ファイル > デフォルト値
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  type BaseServerConfig,
  type ConfigDefs,
  baseConfigDefs,
  filterUndefined,
  generateConfigTemplate,
  generateHelp,
  getDefaultsFromDefs,
  parseCliFromDefs,
  parseConfigFileFromDefs,
  parseEnvFromDefs,
} from '@kajidog/mcp-core'

// VOICEVOX固有の設定定義
const voicevoxConfigDefs: ConfigDefs = {
  voicevoxUrl: {
    cli: '--url',
    env: 'VOICEVOX_URL',
    description: 'VOICEVOX Engine URL',
    group: 'Voicevox Configuration',
    type: 'string',
    default: 'http://localhost:50021',
    valueName: '<url>',
  },
  defaultSpeaker: {
    cli: '--speaker',
    env: 'VOICEVOX_DEFAULT_SPEAKER',
    description: 'Default speaker ID',
    group: 'Voicevox Configuration',
    type: 'number',
    default: 1,
    valueName: '<id>',
  },
  defaultSpeedScale: {
    cli: '--speed',
    env: 'VOICEVOX_DEFAULT_SPEED_SCALE',
    description: 'Default playback speed',
    group: 'Voicevox Configuration',
    type: 'number',
    default: 1.0,
    valueName: '<scale>',
  },
  useStreaming: {
    cli: '--use-streaming',
    env: 'VOICEVOX_USE_STREAMING',
    description: 'Enable streaming playback (ffplay required)',
    group: 'Playback Options',
    type: 'boolean',
  },
  defaultImmediate: {
    cli: '--immediate',
    env: 'VOICEVOX_DEFAULT_IMMEDIATE',
    description: 'Enable immediate playback',
    group: 'Playback Options',
    type: 'boolean',
    default: true,
  },
  defaultWaitForStart: {
    cli: '--wait-for-start',
    env: 'VOICEVOX_DEFAULT_WAIT_FOR_START',
    description: 'Wait for playback to start',
    group: 'Playback Options',
    type: 'boolean',
    default: false,
  },
  defaultWaitForEnd: {
    cli: '--wait-for-end',
    env: 'VOICEVOX_DEFAULT_WAIT_FOR_END',
    description: 'Wait for playback to end',
    group: 'Playback Options',
    type: 'boolean',
    default: false,
  },
  restrictImmediate: {
    cli: '--restrict-immediate',
    env: 'VOICEVOX_RESTRICT_IMMEDIATE',
    description: 'Restrict AI from using immediate option',
    group: 'Restriction Options',
    type: 'boolean',
    default: false,
  },
  restrictWaitForStart: {
    cli: '--restrict-wait-for-start',
    env: 'VOICEVOX_RESTRICT_WAIT_FOR_START',
    description: 'Restrict AI from using waitForStart option',
    group: 'Restriction Options',
    type: 'boolean',
    default: false,
  },
  restrictWaitForEnd: {
    cli: '--restrict-wait-for-end',
    env: 'VOICEVOX_RESTRICT_WAIT_FOR_END',
    description: 'Restrict AI from using waitForEnd option',
    group: 'Restriction Options',
    type: 'boolean',
    default: false,
  },
  disabledTools: {
    cli: '--disable-tools',
    env: 'VOICEVOX_DISABLED_TOOLS',
    description: 'Comma-separated list of tools to disable',
    group: 'Tool Options',
    type: 'string[]',
    default: [],
    valueName: '<tools>',
  },
  autoPlay: {
    cli: '--auto-play',
    env: 'VOICEVOX_AUTO_PLAY',
    description: 'Auto-play audio in UI player',
    group: 'UI Player Options',
    type: 'boolean',
    default: true,
  },
  playerExportEnabled: {
    cli: '--player-export',
    env: 'VOICEVOX_PLAYER_EXPORT_ENABLED',
    description: 'Enable track export(download) in UI player',
    group: 'UI Player Options',
    type: 'boolean',
    default: true,
  },
  playerExportDir: {
    cli: '--player-export-dir',
    env: 'VOICEVOX_PLAYER_EXPORT_DIR',
    description: 'Default output directory for exported tracks',
    group: 'UI Player Options',
    type: 'string',
    valueName: '<dir>',
  },
  playerCacheDir: {
    cli: '--player-cache-dir',
    env: 'VOICEVOX_PLAYER_CACHE_DIR',
    description: 'Player cache directory',
    group: 'UI Player Options',
    type: 'string',
    valueName: '<dir>',
  },
  playerStateFile: {
    cli: '--player-state-file',
    env: 'VOICEVOX_PLAYER_STATE_FILE',
    description: 'Persisted player state file path',
    group: 'UI Player Options',
    type: 'string',
    valueName: '<path>',
  },
  playerAudioCacheEnabled: {
    cli: '--player-audio-cache',
    env: 'VOICEVOX_PLAYER_AUDIO_CACHE_ENABLED',
    description: 'Enable disk audio cache for player',
    group: 'UI Player Options',
    type: 'boolean',
    default: true,
  },
  playerAudioCacheTtlDays: {
    cli: '--player-audio-cache-ttl-days',
    env: 'VOICEVOX_PLAYER_AUDIO_CACHE_TTL_DAYS',
    description: 'Audio cache retention days (0 disables, -1 unlimited)',
    group: 'UI Player Options',
    type: 'number',
    default: 30,
    valueName: '<days>',
  },
  playerAudioCacheMaxMb: {
    cli: '--player-audio-cache-max-mb',
    env: 'VOICEVOX_PLAYER_AUDIO_CACHE_MAX_MB',
    description: 'Audio cache size cap in MB (0 disables, -1 unlimited)',
    group: 'UI Player Options',
    type: 'number',
    default: 512,
    valueName: '<mb>',
  },
  playerDomain: {
    cli: '--player-domain',
    env: 'VOICEVOX_PLAYER_DOMAIN',
    description: 'Player domain',
    group: 'UI Player Options',
    type: 'string',
    default: '',
    valueName: '<domain>',
  },
  configFile: {
    cli: '--config',
    env: 'VOICEVOX_CONFIG',
    description: 'Path to config file (.voicevoxrc.json)',
    group: 'Utility Options',
    type: 'string',
    valueName: '<path>',
  },
}

// 全設定定義（VOICEVOX + base）
export const allConfigDefs: ConfigDefs = {
  ...voicevoxConfigDefs,
  ...baseConfigDefs,
}

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

  // UIプレイヤー設定
  playerDomain: string
  autoPlay: boolean
  playerExportEnabled: boolean
  playerExportDir: string
  playerCacheDir: string
  playerStateFile: string
  playerAudioCacheEnabled: boolean
  playerAudioCacheTtlDays: number
  playerAudioCacheMaxMb: number

  // 無効化ツール
  disabledTools: string[]
}

// パスのデフォルト値（process.cwd()依存のため関数で生成）
function getPathDefaults() {
  return {
    playerExportDir: join(process.cwd(), 'voicevox-player-exports'),
    playerCacheDir: join(process.cwd(), '.voicevox-player-cache'),
    playerStateFile: join(process.cwd(), '.voicevox-player-cache', 'player-state.json'),
  }
}

// デフォルト設定
function createDefaultConfig(): ServerConfig {
  const schemaDefs = getDefaultsFromDefs(allConfigDefs) as Record<string, unknown>
  const pathDefs = getPathDefaults()
  return {
    ...schemaDefs,
    ...pathDefs,
  } as unknown as ServerConfig
}

/**
 * CLI引数をパースする
 */
export function parseCliArgs(argv: string[] = process.argv.slice(2)): Partial<ServerConfig> {
  return parseCliFromDefs(allConfigDefs, argv) as Partial<ServerConfig>
}

/**
 * 環境変数から設定を読み込む
 */
export function parseEnvVars(env: NodeJS.ProcessEnv = process.env): Partial<ServerConfig> {
  return parseEnvFromDefs(allConfigDefs, env) as Partial<ServerConfig>
}

/**
 * 設定ファイルを読み込む
 *
 * --config で指定されたパスか、カレントディレクトリの .voicevoxrc.json を読み込む。
 * ファイルが存在しない場合は空オブジェクトを返す。
 */
export function parseConfigFile(configPath?: string): Partial<ServerConfig> {
  const filePath = configPath ? resolve(configPath) : join(process.cwd(), '.voicevoxrc.json')

  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    return parseConfigFileFromDefs(allConfigDefs, content) as Partial<ServerConfig>
  } catch {
    return {}
  }
}

/**
 * 設定を取得する（優先順位: CLI引数 > 環境変数 > 設定ファイル > デフォルト値）
 */
export function getConfig(argv?: string[], env?: NodeJS.ProcessEnv): ServerConfig {
  const cliConfig = parseCliArgs(argv)
  const envConfig = parseEnvVars(env)

  // 設定ファイルパスをCLI/envから取得
  const configFilePath =
    ((cliConfig as Record<string, unknown>).configFile as string | undefined) ??
    ((envConfig as Record<string, unknown>).configFile as string | undefined)
  const fileConfig = parseConfigFile(configFilePath)

  const defaultConfig = createDefaultConfig()
  const merged: ServerConfig = {
    ...defaultConfig,
    ...filterUndefined(fileConfig),
    ...filterUndefined(envConfig),
    ...filterUndefined(cliConfig),
  }

  // playerStateFile が明示指定されていない場合は、確定した cacheDir に追従させる
  const isPlayerStateFileExplicit =
    envConfig.playerStateFile !== undefined ||
    cliConfig.playerStateFile !== undefined ||
    fileConfig.playerStateFile !== undefined
  if (!isPlayerStateFileExplicit) {
    merged.playerStateFile = join(merged.playerCacheDir, 'player-state.json')
  }
  // configFile は内部用なので削除
  ;(merged as Record<string, unknown>).configFile = undefined

  return merged
}

/**
 * help文を生成する
 */
export function getHelpText(): string {
  return generateHelp(allConfigDefs, {
    usage: 'npx @kajidog/mcp-tts-voicevox [options]',
    examples: [
      'npx @kajidog/mcp-tts-voicevox --url http://192.168.1.50:50021 --speaker 3',
      'npx @kajidog/mcp-tts-voicevox --http --port 8080',
      'npx @kajidog/mcp-tts-voicevox --disable-tools synthesize_file',
      'npx @kajidog/mcp-tts-voicevox --config ./my-config.json',
      'npx @kajidog/mcp-tts-voicevox --init',
    ],
  })
}

/**
 * 設定ファイルのテンプレートJSONを生成する
 */
export function getConfigTemplate(): Record<string, unknown> {
  return generateConfigTemplate(allConfigDefs, { exclude: ['configFile'] })
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
