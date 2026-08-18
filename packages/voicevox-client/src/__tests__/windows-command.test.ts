import { describe, expect, it } from 'vitest'
import {
  buildWindowsPlaybackArgs,
  buildWindowsPlaybackScript,
  encodePathForPowerShell,
} from '../playback/windows-command'

/** スクリプト中に埋め込まれた base64 を取り出してデコードする */
const decodeEmbeddedPath = (script: string): string => {
  const match = script.match(/FromBase64String\("([A-Za-z0-9+/=]*)"\)/)
  if (!match) throw new Error(`base64 リテラルが見つかりません: ${script}`)
  return Buffer.from(match[1] as string, 'base64').toString('utf8')
}

describe('buildWindowsPlaybackScript', () => {
  it('通常の Windows パスがそのまま（バックスラッシュを二重化せず）保たれる', () => {
    const filePath = 'C:\\Users\\test\\AppData\\Local\\Temp\\voicevox\\audio.wav'
    const script = buildWindowsPlaybackScript(filePath)

    expect(decodeEmbeddedPath(script)).toBe(filePath)
    expect(script).not.toContain('\\\\')
    expect(script).not.toContain(filePath)
  })

  it('シングルクォートを含むパスでも文字列を脱出しない', () => {
    const filePath = "C:\\tmp\\it's a test.wav"
    const script = buildWindowsPlaybackScript(filePath)

    expect(decodeEmbeddedPath(script)).toBe(filePath)
    // パス由来の文字はスクリプトに一切現れない
    expect(script).not.toContain("it's")
    expect(script).not.toContain("'")
  })

  it('インジェクションを試みるパスでもコマンドが混入しない', () => {
    const filePath = "C:\\tmp\\x.wav'); Start-Process calc; ('"
    const script = buildWindowsPlaybackScript(filePath)

    expect(decodeEmbeddedPath(script)).toBe(filePath)
    expect(script).not.toContain('Start-Process')
    expect(script).not.toContain('calc')
    // base64 リテラルは常に二重引用符で囲まれた安全な文字集合のみ
    expect(script).toMatch(/FromBase64String\("[A-Za-z0-9+/=]*"\)/)
  })

  it('二重引用符やバッククォートを含むパスも安全に扱える', () => {
    const filePath = 'C:\\tmp\\a"b`c$(whoami).wav'
    const script = buildWindowsPlaybackScript(filePath)

    expect(decodeEmbeddedPath(script)).toBe(filePath)
    expect(script).not.toContain('whoami')
    expect(script).not.toContain('`')
  })

  it('日本語を含むパスは UTF-8 base64 として往復する', () => {
    const filePath = 'C:\\音声\\テスト.wav'
    expect(decodeEmbeddedPath(buildWindowsPlaybackScript(filePath))).toBe(filePath)
    expect(encodePathForPowerShell(filePath)).toBe(Buffer.from(filePath, 'utf8').toString('base64'))
  })

  it('MediaPlayer の再生手順を含む', () => {
    const script = buildWindowsPlaybackScript('C:\\tmp\\a.wav')
    expect(script).toContain('Add-Type -AssemblyName presentationCore')
    expect(script).toContain('New-Object System.Windows.Media.MediaPlayer')
    expect(script).toContain('$player.Open($path)')
    expect(script).toContain('$player.Play()')
    expect(script).toContain('$player.Close()')
  })
})

describe('buildWindowsPlaybackArgs', () => {
  it('powershell の -NoProfile -Command 引数を返す', () => {
    const filePath = "C:\\tmp\\it's a test.wav"
    const args = buildWindowsPlaybackArgs(filePath)

    expect(args[0]).toBe('-NoProfile')
    expect(args[1]).toBe('-Command')
    expect(args).toHaveLength(3)
    expect(args[2]).toBe(buildWindowsPlaybackScript(filePath))
  })
})
