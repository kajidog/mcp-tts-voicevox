import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAllowedOutputPath } from '../output-path.js'

describe('resolveAllowedOutputPath', () => {
  it('allowedDirs 未設定なら任意のパスを絶対パスにして返す（既定は無制限）', () => {
    expect(resolveAllowedOutputPath('/tmp/anywhere/out.wav', { label: 'output' })).toBe('/tmp/anywhere/out.wav')
    expect(resolveAllowedOutputPath('out.wav', { label: 'output' })).toBe(resolve('out.wav'))
  })

  it('allowedDirs が空配列でも無制限として扱う', () => {
    expect(resolveAllowedOutputPath('/etc/passwd', { allowedDirs: [], label: 'output' })).toBe('/etc/passwd')
  })

  it('許可ディレクトリ配下のパスは通す', () => {
    const result = resolveAllowedOutputPath('/data/audio/out.wav', { allowedDirs: ['/data'], label: 'output' })
    expect(result).toBe('/data/audio/out.wav')
  })

  it('許可ディレクトリそのものも通す', () => {
    expect(resolveAllowedOutputPath('/data', { allowedDirs: ['/data'], label: 'outputDir' })).toBe('/data')
  })

  it('prefix が一致するだけの兄弟ディレクトリは拒否する', () => {
    expect(() =>
      resolveAllowedOutputPath('/database/out.wav', { allowedDirs: ['/data'], label: 'output' })
    ).toThrowError(/outside the allowed output directories/)
  })

  it('.. で許可ディレクトリの外へ抜けるパスは拒否する', () => {
    expect(() =>
      resolveAllowedOutputPath('/data/../etc/cron.d/evil', { allowedDirs: ['/data'], label: 'output' })
    ).toThrowError(/outside the allowed output directories/)
  })

  it('複数の許可ディレクトリのいずれかに入っていれば通す', () => {
    const result = resolveAllowedOutputPath('/srv/out/x.wav', {
      allowedDirs: ['/data', '/srv/out'],
      label: 'output',
    })
    expect(result).toBe('/srv/out/x.wav')
  })

  it('空要素混じりの設定（"/data," など）で cwd 全体が許可されない', () => {
    expect(() =>
      resolveAllowedOutputPath(resolve('out.wav'), { allowedDirs: ['/data', '', '  '], label: 'output' })
    ).toThrowError(/outside the allowed output directories/)
  })

  it('末尾の区切り文字を保つ（ディレクトリ指定がファイル扱いにならない）', () => {
    // voicevox-client の saveAudioFile は「末尾が区切り文字ならディレクトリ」と判定するため、
    // path.resolve() が落とす末尾の sep を復元する必要がある
    expect(resolveAllowedOutputPath(`${sep}data${sep}out${sep}`, { allowedDirs: undefined, label: 'output' })).toBe(
      `${sep}data${sep}out${sep}`
    )
    expect(
      resolveAllowedOutputPath(`${sep}data${sep}out${sep}`, { allowedDirs: [`${sep}data`], label: 'output' })
    ).toBe(`${sep}data${sep}out${sep}`)
    // 末尾に区切り文字が無ければ付けない
    expect(resolveAllowedOutputPath(`${sep}data${sep}out.wav`, { allowedDirs: undefined, label: 'output' })).toBe(
      `${sep}data${sep}out.wav`
    )
  })

  it('エラーメッセージに拒否対象・許可ディレクトリ・変更方法が含まれる', () => {
    try {
      resolveAllowedOutputPath('/etc/evil.wav', { allowedDirs: ['/data'], label: 'output' })
      expect.unreachable('should have thrown')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('/etc/evil.wav')
      expect(message).toContain('/data')
      expect(message).toContain('VOICEVOX_ALLOWED_OUTPUT_DIRS')
      expect(message).toContain('--allowed-output-dirs')
    }
  })
})
