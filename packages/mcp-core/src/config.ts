/**
 * MCP Core 基本設定モジュール
 *
 * HTTP/Stdioサーバーの共通設定を管理
 * 優先順位: CLI引数 > 環境変数 > デフォルト値
 */

import {
  type ConfigDefs,
  filterUndefined,
  getDefaultsFromDefs,
  parseCliFromDefs,
  parseEnvFromDefs,
} from './config-schema.js'

// 基本設定の宣言的定義
export const baseConfigDefs: ConfigDefs = {
  httpMode: {
    cli: '--http',
    env: 'MCP_HTTP_MODE',
    description: 'Enable HTTP server mode',
    group: 'Server Options',
    type: 'boolean',
    default: false,
  },
  httpPort: {
    cli: '--port',
    env: 'MCP_HTTP_PORT',
    description: 'HTTP server port',
    group: 'Server Options',
    type: 'number',
    default: 3000,
    valueName: '<port>',
  },
  httpHost: {
    cli: '--host',
    env: 'MCP_HTTP_HOST',
    description: 'HTTP server host',
    group: 'Server Options',
    type: 'string',
    default: '0.0.0.0',
    valueName: '<host>',
  },
  allowedHosts: {
    cli: '--allowed-hosts',
    env: 'MCP_ALLOWED_HOSTS',
    description: 'Comma-separated list of allowed hosts',
    group: 'Server Options',
    type: 'string[]',
    default: ['localhost', '127.0.0.1', '[::1]'],
    valueName: '<hosts>',
  },
  allowedOrigins: {
    cli: '--allowed-origins',
    env: 'MCP_ALLOWED_ORIGINS',
    description: 'Comma-separated list of allowed origins',
    group: 'Server Options',
    type: 'string[]',
    default: ['http://localhost', 'http://127.0.0.1', 'https://localhost', 'https://127.0.0.1'],
    valueName: '<origins>',
  },
  apiKey: {
    cli: '--api-key',
    env: 'MCP_API_KEY',
    description: 'Require matching API key via X-API-Key or Authorization: Bearer',
    group: 'Server Options',
    type: 'string',
    valueName: '<key>',
  },
}

// 基本設定型定義（HTTP/サーバー関連のみ）
export interface BaseServerConfig {
  httpMode: boolean
  httpPort: number
  httpHost: string
  allowedHosts: string[]
  allowedOrigins: string[]
  apiKey?: string
}

// デフォルト設定
export const defaultBaseConfig = getDefaultsFromDefs(baseConfigDefs) as unknown as BaseServerConfig

/**
 * CLI引数から基本設定をパースする
 */
export function parseBaseCliArgs(argv: string[] = process.argv.slice(2)): Partial<BaseServerConfig> {
  return parseCliFromDefs(baseConfigDefs, argv) as Partial<BaseServerConfig>
}

/**
 * 環境変数から基本設定を読み込む
 */
export function parseBaseEnvVars(env: NodeJS.ProcessEnv = process.env): Partial<BaseServerConfig> {
  return parseEnvFromDefs(baseConfigDefs, env) as Partial<BaseServerConfig>
}

export { filterUndefined }
