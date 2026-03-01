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
  it('モーラ数を返す（拗音は1モーラ）', () => {
    expect(estimateAccentType('キョウ')).toBe(2) // キョ + ウ
    expect(estimateAccentType('コーヒー')).toBe(4) // コ + ー + ヒ + ー
  })

  it('最低値は 1', () => {
    expect(estimateAccentType('')).toBe(1)
  })
})

describe('normalizeUserDictionaryWords', () => {
  it('VOICEVOX形式をインライン表記付きUI形式へ正規化する', () => {
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
        pronunciation: 'オ[ン]セイ',
        priority: 5,
      },
    ])
  })
})
