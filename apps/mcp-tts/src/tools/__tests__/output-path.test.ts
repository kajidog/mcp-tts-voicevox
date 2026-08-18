import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAllowedOutputPath } from '../output-path.js'

/**
 * プラットフォーム依存の絶対パスを組み立てる。
 * Windows では `/data` が `D:\data`（cwd のドライブ）に解決されるため、
 * 入力と期待値の両方をこのヘルパーで作って比較する。
 */
const abs = (...parts: string[]): string => resolve(sep, ...parts)

/** 末尾に区切り文字が付いた絶対ディレクトリパス */
const absDir = (...parts: string[]): string => `${abs(...parts)}${sep}`

describe('resolveAllowedOutputPath', () => {
  it('allowedDirs 未設定なら任意のパスを絶対パスにして返す（既定は無制限）', () => {
    expect(resolveAllowedOutputPath(abs('tmp', 'anywhere', 'out.wav'), { label: 'output' })).toBe(
      abs('tmp', 'anywhere', 'out.wav')
    )
    expect(resolveAllowedOutputPath('out.wav', { label: 'output' })).toBe(resolve('out.wav'))
  })

  it('allowedDirs が空配列でも無制限として扱う', () => {
    expect(resolveAllowedOutputPath(abs('etc', 'passwd'), { allowedDirs: [], label: 'output' })).toBe(
      abs('etc', 'passwd')
    )
  })

  it('許可ディレクトリ配下のパスは通す', () => {
    const result = resolveAllowedOutputPath(abs('data', 'audio', 'out.wav'), {
      allowedDirs: [abs('data')],
      label: 'output',
    })
    expect(result).toBe(abs('data', 'audio', 'out.wav'))
  })

  it('許可ディレクトリそのものも通す', () => {
    expect(resolveAllowedOutputPath(abs('data'), { allowedDirs: [abs('data')], label: 'outputDir' })).toBe(abs('data'))
  })

  it('prefix が一致するだけの兄弟ディレクトリは拒否する', () => {
    expect(() =>
      resolveAllowedOutputPath(abs('database', 'out.wav'), { allowedDirs: [abs('data')], label: 'output' })
    ).toThrowError(/outside the allowed output directories/)
  })

  it('.. で許可ディレクトリの外へ抜けるパスは拒否する', () => {
    // 正規化前の生パスを渡す（abs() で組むと .. が先に潰れて検証にならない）
    const traversal = `${abs('data')}${sep}..${sep}etc${sep}cron.d${sep}evil`
    expect(() => resolveAllowedOutputPath(traversal, { allowedDirs: [abs('data')], label: 'output' })).toThrowError(
      /outside the allowed output directories/
    )
  })

  it('複数の許可ディレクトリのいずれかに入っていれば通す', () => {
    const result = resolveAllowedOutputPath(abs('srv', 'out', 'x.wav'), {
      allowedDirs: [abs('data'), abs('srv', 'out')],
      label: 'output',
    })
    expect(result).toBe(abs('srv', 'out', 'x.wav'))
  })

  it('空要素混じりの設定（"/data," など）で cwd 全体が許可されない', () => {
    expect(() =>
      resolveAllowedOutputPath(resolve('out.wav'), { allowedDirs: [abs('data'), '', '  '], label: 'output' })
    ).toThrowError(/outside the allowed output directories/)
  })

  it('末尾の区切り文字を保つ（ディレクトリ指定がファイル扱いにならない）', () => {
    // voicevox-client の saveAudioFile は「末尾が区切り文字ならディレクトリ」と判定するため、
    // path.resolve() が落とす末尾の sep を復元する必要がある
    expect(resolveAllowedOutputPath(absDir('data', 'out'), { allowedDirs: undefined, label: 'output' })).toBe(
      absDir('data', 'out')
    )
    expect(resolveAllowedOutputPath(absDir('data', 'out'), { allowedDirs: [abs('data')], label: 'output' })).toBe(
      absDir('data', 'out')
    )
    // 末尾に区切り文字が無ければ付けない
    expect(resolveAllowedOutputPath(abs('data', 'out.wav'), { allowedDirs: undefined, label: 'output' })).toBe(
      abs('data', 'out.wav')
    )
  })

  it('エラーメッセージに拒否対象・許可ディレクトリ・変更方法が含まれる', () => {
    try {
      resolveAllowedOutputPath(abs('etc', 'evil.wav'), { allowedDirs: [abs('data')], label: 'output' })
      expect.unreachable('should have thrown')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain(abs('etc', 'evil.wav'))
      expect(message).toContain(abs('data'))
      expect(message).toContain('VOICEVOX_ALLOWED_OUTPUT_DIRS')
      expect(message).toContain('--allowed-output-dirs')
    }
  })
})
