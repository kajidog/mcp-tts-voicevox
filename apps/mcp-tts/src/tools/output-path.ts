/**
 * ファイル書き込み先パスの許可判定
 *
 * `allowedOutputDirs`（CLI `--allowed-output-dirs` / env `VOICEVOX_ALLOWED_OUTPUT_DIRS`）が
 * 未設定なら無制限（既定・従来どおり）。設定されている場合のみ、書き込み先が
 * いずれかの許可ディレクトリ配下かを検証し、外ならエラーで拒否する。
 * 黙って別の場所に書き直すフォールバックは行わない。
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * 許可ディレクトリ一覧を正規化する。
 * 空文字要素（"/a," のような設定ミス）は cwd 全体を許可してしまうため取り除く。
 */
function normalizeAllowedDirs(allowedDirs: string[] | undefined): string[] {
  if (!allowedDirs) return []
  return allowedDirs.map((dir) => dir.trim()).filter((dir) => dir.length > 0)
}

/**
 * `target` が `baseDir` と同一か、その配下にあるかを判定する。
 *
 * 文字列の prefix 一致だと `/data` が `/database` にマッチしてしまうため、
 * `path.relative` の結果で判定する（`..` 始まりや絶対パスなら外側）。
 *
 * 注意: シンボリックリンクの解決は行わないため、許可ディレクトリ内に
 * 外部を指すシンボリックリンクがある場合はそれ経由で外に書き込める。
 */
function isInsideDir(baseDir: string, target: string): boolean {
  const rel = relative(baseDir, target)
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith(`..${sep}`)
}

export interface ResolveOutputPathOptions {
  /** 許可ディレクトリ一覧（未設定 = 無制限） */
  allowedDirs?: string[]
  /** エラーメッセージ内でパラメータ名を示すためのラベル（例: "output", "outputDir"） */
  label: string
}

/**
 * 書き込み先パスを解決し、許可ディレクトリ配下であることを検証する。
 *
 * @returns 絶対パスに解決された書き込み先
 * @throws 許可ディレクトリ外だった場合（対処方法を含むメッセージ）
 */
export function resolveAllowedOutputPath(rawPath: string, options: ResolveOutputPathOptions): string {
  const resolved = resolve(rawPath)
  // path.resolve() は末尾の区切り文字を落とすが、voicevox-client の saveAudioFile は
  // 「末尾が区切り文字ならディレクトリ」として扱う（まだ存在しないディレクトリの場合）。
  // 落とすと out/ がファイル out として書かれてしまうため、末尾の区切り文字は保つ。
  const returnPath = /[\\/]$/.test(rawPath) && !resolved.endsWith(sep) ? `${resolved}${sep}` : resolved
  const allowedDirs = normalizeAllowedDirs(options.allowedDirs)

  // 未設定なら制限なし（既定の挙動）
  if (allowedDirs.length === 0) return returnPath

  const resolvedAllowed = allowedDirs.map((dir) => resolve(dir))
  if (resolvedAllowed.some((dir) => isInsideDir(dir, resolved))) {
    return returnPath
  }

  throw new Error(
    `Refused to write "${options.label}" to ${resolved}: it is outside the allowed output directories. ` +
      `Allowed directories: ${resolvedAllowed.join(', ')}. ` +
      'Choose a path under one of them, or change the allowed list with ' +
      '--allowed-output-dirs / VOICEVOX_ALLOWED_OUTPUT_DIRS (unset it to allow any location).'
  )
}
