import { describe, expect, it } from 'vitest'
import { estimateAccentType, isKatakana, normalizeUserDictionaryWords } from '../dictionary-utils'

describe('isKatakana', () => {
  it('カタカナのみなら true', () => {
    expect(isKatakana('コンニチハ')).toBe(true)
    expect(isKatakana('ボイスボックスー')).toBe(true)
  })

  it('ひらがなや英数字を含むと false', () => {
    expect(isKatakana('こんにちは')).toBe(false)
    expect(isKatakana('VOICEVOX')).toBe(false)
    expect(isKatakana('カタカナ1')).toBe(false)
  })
})

describe('estimateAccentType', () => {
  it('長音と小書き文字を除外してモーラ数を返す', () => {
    expect(estimateAccentType('キョウ')).toBe(2) // キョ + ウ
    expect(estimateAccentType('コーヒー')).toBe(2) // コ + ヒ
  })

  it('最低値は 1', () => {
    expect(estimateAccentType('ー')).toBe(1)
  })
})

describe('normalizeUserDictionaryWords', () => {
  it('VOICEVOX形式をUI形式へ正規化する', () => {
    const result = normalizeUserDictionaryWords({
      'word-1': {
        surface: '音声',
        pronunciation: 'オンセイ',
        accent_type: 2,
        priority: 5,
      },
    })

    expect(result).toEqual([
      {
        wordUuid: 'word-1',
        surface: '音声',
        pronunciation: 'オンセイ',
        accentType: 2,
        priority: 5,
      },
    ])
  })
})
