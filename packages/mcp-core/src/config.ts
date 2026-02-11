/**
 * MCP Core 基本設定モジュール
 *
 * HTTP/Stdioサーバーの共通設定を管理
 * 優先順位: CLI引数 > 環境変数 > デフォルト値
 */

// 基本設定型定義（HTTP/サーバー関連のみ）
export interface BaseServerConfig {
  // サーバー設定
  httpMode: boolean
  httpPort: number
  httpHost: string

  // セキュリティ設定（許可するホスト/オリジン）
  allowedHosts: string[]
  allowedOrigins: string[]
}

// デフォルト設定
export const defaultBaseConfig: BaseServerConfig = {
  httpMode: false,
  httpPort: 3000,
  httpHost: '0.0.0.0',
  allowedHosts: ['localhost', '127.0.0.1', '[::1]'],
  allowedOrigins: ['http://localhost', 'http://127.0.0.1', 'https://localhost', 'https://127.0.0.1'],
}

/**
 * CLI引数から基本設定をパースする
 */
export function parseBaseCliArgs(argv: string[] = process.argv.slice(2)): Partial<BaseServerConfig> {
  const config: Partial<BaseServerConfig> = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const nextArg = argv[i + 1]

    switch (arg) {
      case '--http':
        config.httpMode = true
        break
      case '--port':
        if (nextArg && !nextArg.startsWith('-')) {
          config.httpPort = Number(nextArg)
          i++
        }
        break
      case '--host':
        if (nextArg && !nextArg.startsWith('-')) {
          config.httpHost = nextArg
          i++
        }
        break
      case '--allowed-hosts':
        if (nextArg && !nextArg.startsWith('-')) {
          config.allowedHosts = nextArg.split(',').map((h) => h.trim())
          i++
        }
        break
      case '--allowed-origins':
        if (nextArg && !nextArg.startsWith('-')) {
          config.allowedOrigins = nextArg.split(',').map((o) => o.trim())
          i++
        }
        break
    }
  }

  return config
}

/**
 * 環境変数から基本設定を読み込む
 */
export function parseBaseEnvVars(env: NodeJS.ProcessEnv = process.env): Partial<BaseServerConfig> {
  const config: Partial<BaseServerConfig> = {}

  if (env.MCP_HTTP_MODE === 'true') {
    config.httpMode = true
  }

  if (env.MCP_HTTP_PORT) {
    config.httpPort = Number(env.MCP_HTTP_PORT)
  }

  if (env.MCP_HTTP_HOST) {
    config.httpHost = env.MCP_HTTP_HOST
  }

  if (env.MCP_ALLOWED_HOSTS) {
    config.allowedHosts = env.MCP_ALLOWED_HOSTS.split(',').map((h) => h.trim())
  }

  if (env.MCP_ALLOWED_ORIGINS) {
    config.allowedOrigins = env.MCP_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  }

  return config
}

/**
 * undefinedのプロパティを除去する
 */
export function filterUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>
}
