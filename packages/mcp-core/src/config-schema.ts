/**
 * 宣言的な設定スキーマヘルパー
 *
 * 設定オプションをメタデータ付きで定義し、
 * CLI引数パース・環境変数パース・help文生成を自動化する。
 */

import { z } from 'zod/v4'

// オプションの型
type OptionType = 'string' | 'number' | 'boolean' | 'string[]'

/** 設定オプション定義 */
export interface OptionDef {
  /** CLIフラグ名 (例: "--port") */
  cli: string
  /** 環境変数名 (例: "MCP_HTTP_PORT") */
  env?: string
  /** help表示用の説明文 */
  description: string
  /** helpのグループ名 (例: "Server Options") */
  group: string
  /** オプションの型 */
  type: OptionType
  /** デフォルト値 */
  default?: unknown
  /** CLIで値を取る引数の表示名 (例: "<port>") */
  valueName?: string
}

/** 設定定義のマップ */
export type ConfigDefs = Record<string, OptionDef>

/**
 * CLI引数を設定定義からパースする
 */
export function parseCliFromDefs(
  defs: ConfigDefs,
  argv: string[],
): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  // CLIフラグ → 設定キーのマッピングを構築
  const flagMap = new Map<string, { key: string; def: OptionDef }>()
  const negationMap = new Map<string, string>()

  for (const [key, def] of Object.entries(defs)) {
    flagMap.set(def.cli, { key, def })

    // boolean型は自動で --no-* フラグを生成
    if (def.type === 'boolean') {
      const baseName = def.cli.replace(/^--/, '')
      negationMap.set(`--no-${baseName}`, key)
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const nextArg = argv[i + 1]

    // --no-* 否定フラグ（booleanのみ）
    const negKey = negationMap.get(arg)
    if (negKey !== undefined) {
      config[negKey] = false
      continue
    }

    const entry = flagMap.get(arg)
    if (!entry) continue

    const { key, def } = entry

    switch (def.type) {
      case 'boolean':
        config[key] = true
        break

      case 'string':
        if (nextArg && !nextArg.startsWith('-')) {
          config[key] = nextArg
          i++
        }
        break

      case 'number':
        if (nextArg && !nextArg.startsWith('-')) {
          const num = Number(nextArg)
          if (Number.isFinite(num)) {
            config[key] = num
          }
          i++
        }
        break

      case 'string[]':
        if (nextArg && !nextArg.startsWith('-')) {
          config[key] = nextArg.split(',').map((s) => s.trim())
          i++
        }
        break
    }
  }

  return config
}

/**
 * 環境変数を設定定義からパースする
 */
export function parseEnvFromDefs(
  defs: ConfigDefs,
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  for (const [key, def] of Object.entries(defs)) {
    if (!def.env) continue
    const val = env[def.env]
    if (val === undefined) continue

    switch (def.type) {
      case 'boolean':
        // 統一: 'true' → true, 'false' → false, それ以外は設定しない
        if (val === 'true') config[key] = true
        else if (val === 'false') config[key] = false
        break

      case 'number': {
        const num = Number(val)
        if (Number.isFinite(num)) config[key] = num
        break
      }

      case 'string':
        if (val) config[key] = val
        break

      case 'string[]':
        if (val) config[key] = val.split(',').map((s) => s.trim())
        break
    }
  }

  return config
}

/**
 * 設定ファイルの内容を設定定義のキー名に正規化する
 *
 * 設定ファイルではCLIフラグ名のキー（"--" なし、kebab-case → camelCase）を使えるようにする。
 * 例: { "speaker": 3, "use-streaming": true } → { defaultSpeaker: 3, useStreaming: true }
 */
export function parseConfigFileFromDefs(
  defs: ConfigDefs,
  fileContent: Record<string, unknown>,
): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  // CLIフラグ名（-- なし）→ 設定キーのマッピングを構築
  const cliNameMap = new Map<string, { key: string; def: OptionDef }>()
  for (const [key, def] of Object.entries(defs)) {
    const cliName = def.cli.replace(/^--/, '')
    cliNameMap.set(cliName, { key, def })
    // camelCase バージョンも登録
    const camelCase = cliName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (camelCase !== cliName) {
      cliNameMap.set(camelCase, { key, def })
    }
    // 設定キー名そのままも登録
    cliNameMap.set(key, { key, def })
  }

  for (const [fileKey, val] of Object.entries(fileContent)) {
    const entry = cliNameMap.get(fileKey)
    if (!entry) continue

    const { key, def } = entry

    switch (def.type) {
      case 'boolean':
        if (typeof val === 'boolean') config[key] = val
        break
      case 'number':
        if (typeof val === 'number' && Number.isFinite(val)) config[key] = val
        break
      case 'string':
        if (typeof val === 'string') config[key] = val
        break
      case 'string[]':
        if (Array.isArray(val)) config[key] = val.filter((v): v is string => typeof v === 'string')
        else if (typeof val === 'string') config[key] = val.split(',').map((s) => s.trim())
        break
    }
  }

  return config
}

/**
 * 設定定義からデフォルト値を抽出する
 */
export function getDefaultsFromDefs(defs: ConfigDefs): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(defs)) {
    if (def.default !== undefined) {
      defaults[key] = def.default
    }
  }
  return defaults
}

/**
 * 設定定義からhelp文を生成する
 */
export function generateHelp(
  defs: ConfigDefs,
  opts?: { usage?: string; examples?: string[] },
): string {
  const lines: string[] = []

  if (opts?.usage) {
    lines.push(`Usage: ${opts.usage}`)
    lines.push('')
  }

  lines.push('Options:')
  lines.push('  --help, -h                  Show this help message')
  lines.push('  --version, -v               Show version number')
  lines.push('')

  // グループごとに整理
  const groups = new Map<string, { key: string; def: OptionDef }[]>()
  for (const [key, def] of Object.entries(defs)) {
    const group = def.group
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push({ key, def })
  }

  for (const [groupName, entries] of groups) {
    lines.push(`  ${groupName}:`)

    for (const { def } of entries) {
      const flag = def.type === 'boolean'
        ? def.cli
        : `${def.cli} ${def.valueName || '<value>'}`

      const defaultStr = def.default !== undefined
        ? ` (default: ${Array.isArray(def.default) ? def.default.join(',') : def.default})`
        : ''

      const line = `  ${flag.padEnd(28)}${def.description}${defaultStr}`
      lines.push(line)

      // boolean型は --no-* も表示
      if (def.type === 'boolean') {
        const baseName = def.cli.replace(/^--/, '')
        const negFlag = `--no-${baseName}`
        lines.push(`  ${negFlag.padEnd(28)}Disable ${def.description.toLowerCase().replace(/^enable /, '')}`)
      }
    }

    lines.push('')
  }

  if (opts?.examples?.length) {
    lines.push('Examples:')
    for (const ex of opts.examples) {
      lines.push(`  ${ex}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Zodスキーマで設定値をバリデーションする
 */
export function validateConfig<T>(schema: z.ZodType<T>, config: Record<string, unknown>): T {
  return schema.parse(config)
}

/**
 * undefinedのプロパティを除去する
 */
export function filterUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>
}
