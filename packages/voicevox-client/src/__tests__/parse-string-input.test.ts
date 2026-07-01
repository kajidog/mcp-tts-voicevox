import { describe, expect, it } from 'vitest'
import { parseStringInput } from '../utils'

describe('parseStringInput', () => {
  it('話者プレフィックス付きの行をパースする', () => {
    expect(parseStringInput('1:Hello')).toEqual([{ text: 'Hello', speaker: 1 }])
  })

  it('複数行を話者プレフィックス付きでパースする', () => {
    expect(parseStringInput('1:Hello\n2:World')).toEqual([
      { text: 'Hello', speaker: 1 },
      { text: 'World', speaker: 2 },
    ])
  })

  it('プレフィックスなしの行はそのままテキストになる', () => {
    expect(parseStringInput('こんにちは')).toEqual([{ text: 'こんにちは' }])
  })

  it('時刻表記（10:30）は話者プレフィックスとして扱わない', () => {
    expect(parseStringInput('10:30に集合')).toEqual([{ text: '10:30に集合' }])
  })

  it('時刻表記（1:23:45）は話者プレフィックスとして扱わない', () => {
    expect(parseStringInput('1:23:45 経過しました')).toEqual([{ text: '1:23:45 経過しました' }])
  })

  it('コロンの後に空白を挟んで数字が続く場合もテキスト扱いにする', () => {
    expect(parseStringInput('10: 30に集合')).toEqual([{ text: '10: 30に集合' }])
  })

  it('コロンの後が数字以外なら話者プレフィックスとして扱う', () => {
    expect(parseStringInput('3: こんにちは')).toEqual([{ text: 'こんにちは', speaker: 3 }])
  })

  it('話者プレフィックスと時刻表記の混在行を正しくパースする', () => {
    expect(parseStringInput('1:Hello\n10:30に集合')).toEqual([{ text: 'Hello', speaker: 1 }, { text: '10:30に集合' }])
  })

  it('リテラルの \\n も改行として扱う', () => {
    expect(parseStringInput('1:Hello\\n2:World')).toEqual([
      { text: 'Hello', speaker: 1 },
      { text: 'World', speaker: 2 },
    ])
  })
})
