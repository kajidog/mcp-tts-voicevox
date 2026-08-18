import { describe, expect, it } from 'vitest'
import {
  accentPhrasesToNotation,
  accentPhrasesToSimplifiedPhrases,
  applyAccentsToAccentPhrases,
  applyNotationAccents,
  estimateAccentType,
  isKatakana,
  normalizeUserDictionaryWords,
  parseNotation,
  resolveAccentFromMoras,
} from '../accent-utils'
import type { AccentPhrase, Mora } from '../types'

function makeMora(text: string, vowel = 'a', pitch = 5.0): Mora {
  return { text, vowel, vowel_length: 0.1, pitch }
}

function makeAccentPhrase(moraTexts: string[], accent: number): AccentPhrase {
  return {
    moras: moraTexts.map((t) => makeMora(t)),
    accent,
  }
}

// ---------------------------------------------------------------------------
// phrase-utils テスト
// ---------------------------------------------------------------------------

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

describe('accentPhrasesToNotation', () => {
  it('基本変換: accent位置のモーラを[]で囲む', () => {
    const phrases: AccentPhrase[] = [
      makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3),
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    expect(accentPhrasesToNotation(phrases)).toBe('コン[ニ]チワ,[セ]カイ')
  })

  it('平板型(accent=0)は[]なし', () => {
    const phrases: AccentPhrase[] = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 0)]
    expect(accentPhrasesToNotation(phrases)).toBe('コンニチワ')
  })

  it('空配列は空文字列', () => {
    expect(accentPhrasesToNotation([])).toBe('')
  })

  it('単一モーラのフレーズ', () => {
    const phrases: AccentPhrase[] = [makeAccentPhrase(['ア'], 1)]
    expect(accentPhrasesToNotation(phrases)).toBe('[ア]')
  })

  it('拗音(text.length=2)のモーラを含む場合', () => {
    const phrases: AccentPhrase[] = [
      {
        moras: [makeMora('キョ'), makeMora('ウ')],
        accent: 1,
      },
    ]
    expect(accentPhrasesToNotation(phrases)).toBe('[キョ]ウ')
  })
})

describe('parseNotation', () => {
  it('[]ありのフレーズをパースする', () => {
    const result = parseNotation('コン[ニ]チワ')
    expect(result).toEqual([{ cleanText: 'コンニチワ', bracketCharIndex: 2, bracketLength: 1 }])
  })

  it('[]なしのフレーズをパースする', () => {
    const result = parseNotation('セカイ')
    expect(result).toEqual([{ cleanText: 'セカイ', bracketCharIndex: null, bracketLength: 0 }])
  })

  it('複数フレーズをカンマ区切りでパースする', () => {
    const result = parseNotation('コン[ニ]チワ,セカイ')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ cleanText: 'コンニチワ', bracketCharIndex: 2, bracketLength: 1 })
    expect(result[1]).toEqual({ cleanText: 'セカイ', bracketCharIndex: null, bracketLength: 0 })
  })

  it('空文字列は空配列を返す', () => {
    expect(parseNotation('')).toEqual([])
    expect(parseNotation('  ')).toEqual([])
  })

  it('空フレーズ(連続カンマ)はフィルタされる', () => {
    const result = parseNotation(',コン[ニ]チワ,,セカイ,')
    expect(result).toHaveLength(2)
  })

  it('拗音を[]で囲める', () => {
    const result = parseNotation('[キョ]ウ')
    expect(result).toEqual([{ cleanText: 'キョウ', bracketCharIndex: 0, bracketLength: 2 }])
  })

  it('[が2つ以上でエラー', () => {
    expect(() => parseNotation('[コ][ン]')).toThrow('multiple')
  })

  it('括弧の対応不正でエラー', () => {
    expect(() => parseNotation('[コン')).toThrow('mismatched')
    expect(() => parseNotation('コン]')).toThrow('mismatched')
  })

  it(']が[より前でエラー', () => {
    expect(() => parseNotation(']コン[')).toThrow()
  })

  it('空の括弧でエラー', () => {
    expect(() => parseNotation('コン[]チワ')).toThrow('empty')
  })
})

describe('resolveAccentFromMoras', () => {
  it('通常モーラで正しいインデックスを返す(1-based)', () => {
    const moras = [makeMora('コ'), makeMora('ン'), makeMora('ニ'), makeMora('チ'), makeMora('ワ')]
    expect(resolveAccentFromMoras(moras, 2, 1)).toBe(3)
  })

  it('先頭モーラ', () => {
    const moras = [makeMora('セ'), makeMora('カ'), makeMora('イ')]
    expect(resolveAccentFromMoras(moras, 0, 1)).toBe(1)
  })

  it('拗音(text.length=2)のモーラ', () => {
    const moras = [makeMora('キョ'), makeMora('ウ')]
    expect(resolveAccentFromMoras(moras, 0, 2)).toBe(1)
    expect(resolveAccentFromMoras(moras, 2, 1)).toBe(2)
  })

  it('bracketLengthがモーラのtext.lengthと不一致でエラー', () => {
    const moras = [makeMora('キョ'), makeMora('ウ')]
    expect(() => resolveAccentFromMoras(moras, 0, 1)).toThrow('does not match mora text length')
  })

  it('不正な位置でエラー', () => {
    const moras = [makeMora('コ'), makeMora('ン')]
    expect(() => resolveAccentFromMoras(moras, 5, 1)).toThrow('does not align')
  })

  it('モーラ境界でない位置でエラー', () => {
    const moras = [makeMora('キョ'), makeMora('ウ')]
    expect(() => resolveAccentFromMoras(moras, 1, 1)).toThrow('does not align')
  })
})

describe('applyNotationAccents', () => {
  it('[]指定ありのフレーズはアクセントを上書きする', () => {
    const parsed = parseNotation('[コ]ンニチワ')
    const accentPhrases = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].accent).toBe(1)
  })

  it('[]指定なしでdefaultAccentPhrasesなし → 既存accent維持', () => {
    const parsed = parseNotation('セカイ')
    const accentPhrases = [makeAccentPhrase(['セ', 'カ', 'イ'], 2)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].accent).toBe(2)
  })

  it('[]指定なしでdefaultAccentPhrasesあり → VOICEVOXデフォルトaccentを使用', () => {
    const parsed = parseNotation('セカイ')
    const existing = [makeAccentPhrase(['セ', 'カ', 'イ'], 2)]
    const defaults = [makeAccentPhrase(['セ', 'カ', 'イ'], 1)]
    const result = applyNotationAccents(parsed, existing, defaults)
    expect(result[0].accent).toBe(1)
  })

  it('[]あり/なし混在（defaultAccentPhrasesあり）', () => {
    const parsed = parseNotation('コン[ニ]チワ,セカイ')
    const existing = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 1), makeAccentPhrase(['セ', 'カ', 'イ'], 2)]
    const defaults = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 4), makeAccentPhrase(['セ', 'カ', 'イ'], 1)]
    const result = applyNotationAccents(parsed, existing, defaults)
    expect(result[0].accent).toBe(3)
    expect(result[1].accent).toBe(1)
  })

  it('[]あり/なし混在（defaultAccentPhrasesなし）', () => {
    const parsed = parseNotation('コン[ニ]チワ,セカイ')
    const accentPhrases = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 1), makeAccentPhrase(['セ', 'カ', 'イ'], 2)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].accent).toBe(3)
    expect(result[1].accent).toBe(2)
  })

  it('parsedPhrasesがaccentPhrasesより少ない場合、余分なAccentPhraseはデフォルト維持', () => {
    const parsed = parseNotation('[コ]ンニチワ')
    const accentPhrases = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3), makeAccentPhrase(['セ', 'カ', 'イ'], 2)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].accent).toBe(1)
    expect(result[1].accent).toBe(2)
  })

  it('parsedPhrasesがaccentPhrasesより多い場合、余分は無視', () => {
    const parsed = parseNotation('[コ]ンニチワ,[セ]カイ,[ア]イウ')
    const accentPhrases = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(1)
    expect(result[0].accent).toBe(1)
  })

  it('元のAccentPhraseを変更しない（イミュータブル）', () => {
    const parsed = parseNotation('[コ]ンニチワ')
    const original = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3)]
    const result = applyNotationAccents(parsed, original)
    expect(original[0].accent).toBe(3)
    expect(result[0].accent).toBe(1)
  })
})

describe('ラウンドトリップ', () => {
  it('accentPhrasesToNotation → parseNotation → applyNotationAccents で元のaccent値が復元される', () => {
    const original: AccentPhrase[] = [
      makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3),
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    const notation = accentPhrasesToNotation(original)
    const parsed = parseNotation(notation)
    const resetAccent = original.map((p) => ({ ...p, accent: 0 }))
    const result = applyNotationAccents(parsed, resetAccent)
    expect(result[0].accent).toBe(3)
    expect(result[1].accent).toBe(1)
  })

  it('平板型(accent=0)はラウンドトリップでVOICEVOXデフォルトに戻る', () => {
    const original: AccentPhrase[] = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 0)]
    const notation = accentPhrasesToNotation(original)
    expect(notation).toBe('コンニチワ')
    const parsed = parseNotation(notation)
    const existing = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 5)]
    const defaults = [makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3)]
    const result = applyNotationAccents(parsed, existing, defaults)
    expect(result[0].accent).toBe(3)
  })

  it('拗音を含むフレーズのラウンドトリップ', () => {
    const original: AccentPhrase[] = [
      {
        moras: [makeMora('キョ'), makeMora('ウ')],
        accent: 1,
      },
    ]
    const notation = accentPhrasesToNotation(original)
    expect(notation).toBe('[キョ]ウ')
    const parsed = parseNotation(notation)
    const resetAccent = original.map((p) => ({ ...p, accent: 0 }))
    const result = applyNotationAccents(parsed, resetAccent)
    expect(result[0].accent).toBe(1)
  })
})

describe('I/O契約テスト', () => {
  it('get_player_stateの出力phrasesをresynthesize_playerの入力としてパースできる', () => {
    const accentPhrases: AccentPhrase[] = [
      makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3),
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    const phrasesOutput = accentPhrasesToNotation(accentPhrases)
    const parsed = parseNotation(phrasesOutput)
    expect(parsed).toHaveLength(2)
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].accent).toBe(3)
    expect(result[1].accent).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// dictionary-utils テスト
// ---------------------------------------------------------------------------

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
    expect(estimateAccentType('キョウ')).toBe(2)
    expect(estimateAccentType('コーヒー')).toBe(4)
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
        pronunciation: 'オンセイ',
        accentType: 2,
        notation: 'オ[ン]セイ',
        priority: 5,
      },
    ])
  })
})

// ---------------------------------------------------------------------------
// notation のフレーズ区切りと VOICEVOX のアクセント句区切りがずれるケース
// ---------------------------------------------------------------------------

describe('applyNotationAccents: アクセント句の区切りが notation と一致しない場合', () => {
  it('1フレーズが複数アクセント句に分割されていても括弧位置を解決できる', () => {
    // VOICEVOX は "アクセントシ" を ["アクセント", "シ"] に分割することがある。
    // 旧実装では accentPhrases[0] に対して括弧位置5を探すため
    // "Bracket position 5 does not align with any mora boundary" になっていた。
    const parsed = parseNotation('アクセント[シ]')
    const accentPhrases = [makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト'], 1), makeAccentPhrase(['シ'], 1)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(1)
    expect(result[0].moras.map((m) => m.text).join('')).toBe('アクセントシ')
    expect(result[0].accent).toBe(6)
  })

  it('複数フレーズがそれぞれ分割されていても正しく対応付ける', () => {
    const parsed = parseNotation('アクセント[シ]テエノ,カクニン[デ]ス')
    const accentPhrases = [
      makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト'], 1),
      makeAccentPhrase(['シ', 'テ', 'エ', 'ノ'], 1),
      makeAccentPhrase(['カ', 'ク', 'ニ', 'ン'], 1),
      makeAccentPhrase(['デ', 'ス'], 1),
    ]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[0].moras.map((m) => m.text).join('')).toBe('アクセントシテエノ')
    expect(result[0].accent).toBe(6)
    expect(result[1].moras.map((m) => m.text).join('')).toBe('カクニンデス')
    expect(result[1].accent).toBe(5)
  })

  it('1つのアクセント句が複数フレーズにまたがる場合は分割する', () => {
    const parsed = parseNotation('テ[ス]ト,ロ[ク]')
    const accentPhrases = [makeAccentPhrase(['テ', 'ス', 'ト', 'ロ', 'ク'], 1)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[0].moras.map((m) => m.text).join('')).toBe('テスト')
    expect(result[0].accent).toBe(2)
    expect(result[1].moras.map((m) => m.text).join('')).toBe('ロク')
    expect(result[1].accent).toBe(2)
  })

  it('結合時は末尾の pause_mora を引き継ぐ', () => {
    const parsed = parseNotation('アクセント[シ]')
    const accentPhrases: AccentPhrase[] = [
      makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト'], 1),
      { ...makeAccentPhrase(['シ'], 1), pause_mora: makeMora('、'), is_interrogative: true },
    ]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].pause_mora?.text).toBe('、')
    expect(result[0].is_interrogative).toBe(true)
  })

  it('分割時は前半に pause_mora / is_interrogative を引き継がない', () => {
    const parsed = parseNotation('テ[ス]ト,ロ[ク]')
    const accentPhrases: AccentPhrase[] = [
      {
        ...makeAccentPhrase(['テ', 'ス', 'ト', 'ロ', 'ク'], 1),
        pause_mora: makeMora('、'),
        is_interrogative: true,
      },
    ]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result[0].pause_mora).toBeUndefined()
    expect(result[0].is_interrogative).toBe(false)
    expect(result[1].pause_mora?.text).toBe('、')
    expect(result[1].is_interrogative).toBe(true)
  })

  it('[]なしのフレーズは VOICEVOX のアクセント句分割を維持する', () => {
    const parsed = parseNotation('アクセントシ')
    const accentPhrases = [makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト'], 3), makeAccentPhrase(['シ'], 1)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[0].accent).toBe(3)
    expect(result[1].accent).toBe(1)
  })

  it('notation より長い分の AccentPhrase はそのまま後ろに残る', () => {
    const parsed = parseNotation('テ[ス]ト')
    const accentPhrases = [makeAccentPhrase(['テ', 'ス', 'ト', 'ロ', 'ク'], 4)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[0].moras.map((m) => m.text).join('')).toBe('テスト')
    expect(result[0].accent).toBe(2)
    expect(result[1].moras.map((m) => m.text).join('')).toBe('ロク')
    // 元の accent 4 は分割後の位置(1)に付け替わる
    expect(result[1].accent).toBe(1)
  })

  it('テキストを対応付けられない場合は従来のインデックス対応にフォールバックする', () => {
    // モーラ数が notation より少なく、区切り直しができないケース
    const parsed = parseNotation('[ア]イウエオ')
    const accentPhrases = [makeAccentPhrase(['ア', 'イ'], 2)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(1)
    expect(result[0].accent).toBe(1)
  })

  it('モーラ境界と一致しない括弧位置はエラーのまま', () => {
    const parsed = parseNotation('キ[ョ]ウ')
    const accentPhrases = [makeAccentPhrase(['キョ', 'ウ'], 1)]
    expect(() => applyNotationAccents(parsed, accentPhrases)).toThrow()
  })
})

describe('applyNotationAccents: 読点（pause_mora）を含む notation', () => {
  it('1フレーズの中に読点があるとモーラと対応付けできずエラーになる', () => {
    // 読点は moras ではなく pause_mora として表現されるため、notation の
    // 文字位置とモーラ列がずれる。フレーズは "," で区切る必要がある。
    const parsed = parseNotation('コンニチワ、セ[カ]イ')
    const accentPhrases: AccentPhrase[] = [
      { ...makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3), pause_mora: makeMora('、') },
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    expect(() => applyNotationAccents(parsed, accentPhrases)).toThrow('does not align')
  })

  it('"," で区切れば読点付きのアクセント句も扱える', () => {
    const parsed = parseNotation('コンニチワ,セ[カ]イ')
    const accentPhrases: AccentPhrase[] = [
      { ...makeAccentPhrase(['コ', 'ン', 'ニ', 'チ', 'ワ'], 3), pause_mora: makeMora('、') },
      makeAccentPhrase(['セ', 'カ', 'イ'], 1),
    ]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[0].pause_mora?.text).toBe('、')
    expect(result[1].accent).toBe(2)
  })
})

describe('applyNotationAccents: 平板型(accent=0)の維持', () => {
  it('フレーズ分割で平板型が頭高型に変わらない', () => {
    const parsed = parseNotation('テスト,ロク')
    const accentPhrases = [makeAccentPhrase(['テ', 'ス', 'ト', 'ロ', 'ク'], 0)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[0].accent).toBe(0)
    expect(result[1].accent).toBe(0)
  })

  it('notation より長い余り部分でも平板型を維持する', () => {
    const parsed = parseNotation('テスト')
    const accentPhrases = [makeAccentPhrase(['テ', 'ス', 'ト', 'ロ', 'ク'], 0)]
    const result = applyNotationAccents(parsed, accentPhrases)
    expect(result).toHaveLength(2)
    expect(result[1].moras.map((m) => m.text).join('')).toBe('ロク')
    expect(result[1].accent).toBe(0)
  })
})

describe('applyNotationAccents: [] 省略時のデフォルト復元', () => {
  it('既存とデフォルトで区切りが違ってもデフォルトに戻せる', () => {
    // [] 付き編集で結合されたアクセント句が base になっているケース。
    // 括弧を外したらデフォルト（VOICEVOX の分割とアクセント）に戻る必要がある。
    const parsed = parseNotation('アクセントシテエノ')
    const edited = [makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト', 'シ', 'テ', 'エ', 'ノ'], 6)]
    const defaults = [
      makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト'], 1),
      makeAccentPhrase(['シ', 'テ', 'エ', 'ノ'], 2),
    ]
    const result = applyNotationAccents(parsed, edited, defaults)
    expect(result).toHaveLength(2)
    expect(result[0].moras.map((m) => m.text).join('')).toBe('アクセント')
    expect(result[0].accent).toBe(1)
    expect(result[1].moras.map((m) => m.text).join('')).toBe('シテエノ')
    expect(result[1].accent).toBe(2)
  })

  it('[] ありのフレーズはデフォルトに戻さず括弧位置を優先する', () => {
    const parsed = parseNotation('アクセント[シ]テエノ')
    const edited = [makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト', 'シ', 'テ', 'エ', 'ノ'], 1)]
    const defaults = [
      makeAccentPhrase(['ア', 'ク', 'セ', 'ン', 'ト'], 1),
      makeAccentPhrase(['シ', 'テ', 'エ', 'ノ'], 2),
    ]
    const result = applyNotationAccents(parsed, edited, defaults)
    expect(result).toHaveLength(1)
    expect(result[0].accent).toBe(6)
  })
})
