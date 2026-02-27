import type { AccentPhrase, Mora } from '@kajidog/voicevox-client'
import { describe, expect, it } from 'vitest'
import { accentPhrasesToSimplifiedPhrases, applyAccentsToAccentPhrases } from '../tools/player-phrase-utils'

function makeMora(text: string, vowel = 'a', pitch = 5.0): Mora {
  return { text, vowel, vowel_length: 0.1, pitch }
}

function makeAccentPhrase(moraTexts: string[], accent: number): AccentPhrase {
  return {
    moras: moraTexts.map((t) => makeMora(t)),
    accent,
  }
}

describe('accentPhrasesToSimplifiedPhrases', () => {
  it('各AccentPhraseのmora.textを結合してaccent値を返す', () => {
    const phrases: AccentPhrase[] = [
      makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3),
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    const result = accentPhrasesToSimplifiedPhrases(phrases)
    expect(result).toEqual([
      { text: 'コンニチワ', accent: 3 },
      { text: 'セカイ', accent: 1 },
    ])
  })

  it('空配列を渡すと空配列を返す', () => {
    expect(accentPhrasesToSimplifiedPhrases([])).toEqual([])
  })

  it('単一モーラのフレーズを処理する', () => {
    const phrases: AccentPhrase[] = [makeAccentPhrase(['ア'], 1)]
    const result = accentPhrasesToSimplifiedPhrases(phrases)
    expect(result).toEqual([{ text: 'ア', accent: 1 }])
  })

  it('pause_moraやis_interrogativeがあっても無視してテキストとアクセントのみ返す', () => {
    const phrase: AccentPhrase = {
      moras: [makeMora('デ'), makeMora('ス')],
      accent: 1,
      pause_mora: makeMora('、'),
      is_interrogative: true,
    }
    const result = accentPhrasesToSimplifiedPhrases([phrase])
    expect(result).toEqual([{ text: 'デス', accent: 1 }])
  })
})

describe('applyAccentsToAccentPhrases', () => {
  it('インデックスで照合してaccent値を更新する', () => {
    const existing: AccentPhrase[] = [
      makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3),
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    const result = applyAccentsToAccentPhrases(existing, [5, 2])
    expect(result[0].accent).toBe(5)
    expect(result[1].accent).toBe(2)
  })

  it('accentsが既存より少ない場合、残りはそのまま', () => {
    const existing: AccentPhrase[] = [
      makeAccentPhrase(['ア'], 1),
      makeAccentPhrase(['イ'], 2),
      makeAccentPhrase(['ウ'], 3),
    ]
    const result = applyAccentsToAccentPhrases(existing, [5])
    expect(result[0].accent).toBe(5)
    expect(result[1].accent).toBe(2)
    expect(result[2].accent).toBe(3)
  })

  it('accentsが既存より多い場合、余分は無視される', () => {
    const existing: AccentPhrase[] = [makeAccentPhrase(['ア'], 1)]
    const result = applyAccentsToAccentPhrases(existing, [5, 2, 3])
    expect(result).toHaveLength(1)
    expect(result[0].accent).toBe(5)
  })

  it('moraデータは変更されない', () => {
    const existing: AccentPhrase[] = [makeAccentPhrase(['コ', 'ン'], 3)]
    const result = applyAccentsToAccentPhrases(existing, [1])
    expect(result[0].moras).toEqual(existing[0].moras)
    expect(result[0].accent).toBe(1)
  })

  it('空のaccentsを渡すと既存がそのまま返る', () => {
    const existing: AccentPhrase[] = [makeAccentPhrase(['ア'], 2)]
    const result = applyAccentsToAccentPhrases(existing, [])
    expect(result[0].accent).toBe(2)
  })

  it('元のAccentPhraseを変更しない（イミュータブル）', () => {
    const existing: AccentPhrase[] = [makeAccentPhrase(['ア'], 1)]
    const result = applyAccentsToAccentPhrases(existing, [5])
    expect(existing[0].accent).toBe(1)
    expect(result[0].accent).toBe(5)
  })
})
