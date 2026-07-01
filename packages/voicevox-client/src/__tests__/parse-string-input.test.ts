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

  it('コロンの後が数字以外なら話者プレフィックスとして扱う', () => {
    expect(parseStringInput('3: こんにちは')).toEqual([{ text: 'こんにちは', speaker: 3 }])
  })

  it('数字始まりテキストへの話者プレフィックスは維持する（3桁以上は時刻扱いしない）', () => {
    expect(parseStringInput('3:2026年もよろしく')).toEqual([{ text: '2026年もよろしく', speaker: 3 }])
  })

  it('コロンの後に空白を挟む場合は時刻扱いせず話者プレフィックスとして扱う', () => {
    expect(parseStringInput('2: 123')).toEqual([{ text: '123', speaker: 2 }])
  })

  it('話者部分が3桁以上なら時刻扱いせず話者プレフィックスとして扱う', () => {
    expect(parseStringInput('888:45と読んで')).toEqual([{ text: '45と読んで', speaker: 888 }])
  })

  it('分が2桁を超える場合は時刻扱いせず話者プレフィックスとして扱う', () => {
    expect(parseStringInput('10:305号室へ')).toEqual([{ text: '305号室へ', speaker: 10 }])
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
