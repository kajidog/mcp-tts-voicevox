import type { AccentPhrase, Mora } from './types.js'

// ---------------------------------------------------------------------------
// phrase-utils: AccentPhrase 操作
// ---------------------------------------------------------------------------

/**
 * AccentPhrase[] から AI 向けの簡略フレーズ配列を生成。
 * 各 AccentPhrase の mora.text を連結してフレーズテキストを作り、
 * accent 位置はそのまま返す。
 */
export function accentPhrasesToSimplifiedPhrases(
  accentPhrases: AccentPhrase[]
): Array<{ text: string; accent: number }> {
  return accentPhrases.map((phrase) => ({
    text: phrase.moras.map((m) => m.text).join(''),
    accent: phrase.accent,
  }))
}

/**
 * accent 数値配列を既存の AccentPhrase[] にマージする。
 * インデックスで照合し、accent 値のみ更新する。
 * accents が既存より少ない場合は残りはそのまま、多い場合は無視する。
 */
export function applyAccentsToAccentPhrases(existing: AccentPhrase[], accents: number[]): AccentPhrase[] {
  return existing.map((phrase, i) => {
    if (i < accents.length) {
      return { ...phrase, accent: accents[i] }
    }
    return phrase
  })
}

// ---------------------------------------------------------------------------
// インライン表記方式
// ---------------------------------------------------------------------------

export interface ParsedPhrase {
  cleanText: string
  bracketCharIndex: number | null
  bracketLength: number
}

/**
 * AccentPhrase[] → インライン表記文字列に変換。
 * 例: "コン[ニ]チワ,セ[カ]イ"
 * accent === 0 (平板型) → [] なし
 */
export function accentPhrasesToNotation(accentPhrases: AccentPhrase[]): string {
  return accentPhrases
    .map((phrase) => {
      const moraTexts = phrase.moras.map((m) => m.text)
      if (phrase.accent === 0) {
        return moraTexts.join('')
      }
      return moraTexts
        .map((t, i) => {
          const moraIndex = i + 1 // 1-based
          return moraIndex === phrase.accent ? `[${t}]` : t
        })
        .join('')
    })
    .join(',')
}

/**
 * インライン表記文字列 → ParsedPhrase[] にパース。
 * 例: "コン[ニ]チワ,セカイ" → [{cleanText:"コンニチワ", bracketCharIndex:2, bracketLength:1}, ...]
 */
export function parseNotation(notation: string): ParsedPhrase[] {
  if (!notation.trim()) return []

  const rawPhrases = notation.split(',')
  const result: ParsedPhrase[] = []

  for (const raw of rawPhrases) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    // バリデーション: 予約文字チェック（ネスト、不正な括弧）
    const openCount = (trimmed.match(/\[/g) || []).length
    const closeCount = (trimmed.match(/\]/g) || []).length

    if (openCount > 1) {
      throw new Error(`Invalid notation: multiple '[' in phrase "${trimmed}"`)
    }
    if (openCount !== closeCount) {
      throw new Error(`Invalid notation: mismatched brackets in phrase "${trimmed}"`)
    }

    if (openCount === 0) {
      result.push({ cleanText: trimmed, bracketCharIndex: null, bracketLength: 0 })
      continue
    }

    // [ ] の位置を検出
    const openIdx = trimmed.indexOf('[')
    const closeIdx = trimmed.indexOf(']')

    if (closeIdx < openIdx) {
      throw new Error(`Invalid notation: ']' before '[' in phrase "${trimmed}"`)
    }

    const bracketContent = trimmed.substring(openIdx + 1, closeIdx)
    if (bracketContent.length === 0) {
      throw new Error(`Invalid notation: empty brackets in phrase "${trimmed}"`)
    }

    const cleanText = trimmed.substring(0, openIdx) + bracketContent + trimmed.substring(closeIdx + 1)
    const bracketCharIndex = openIdx

    result.push({ cleanText, bracketCharIndex, bracketLength: bracketContent.length })
  }

  return result
}

/**
 * VOICEVOXのモーラ配列内で bracketCharIndex に該当するモーラの accent 値(1-based)を返す。
 * bracketLength がモーラの text.length と一致することを検証する。
 */
export function resolveAccentFromMoras(moras: Mora[], bracketCharIndex: number, bracketLength: number): number {
  let charPos = 0
  for (let i = 0; i < moras.length; i++) {
    const mora = moras[i]
    if (charPos === bracketCharIndex) {
      if (mora.text.length !== bracketLength) {
        throw new Error(
          `Bracket content length (${bracketLength}) does not match mora text length (${mora.text.length}) at mora "${mora.text}". Brackets must enclose exactly one mora.`
        )
      }
      return i + 1 // 1-based
    }
    charPos += mora.text.length
  }
  throw new Error(
    `Bracket position ${bracketCharIndex} does not align with any mora boundary. Check that brackets enclose exactly one mora.`
  )
}

/**
 * ParsedPhrase[] のアクセント指定を AccentPhrase[] に適用する。
 * 左から1:1で対応。数が合わない場合、余分は無視/デフォルト維持。
 *
 * bracketCharIndex === null（[] 省略）のフレーズ:
 *   - defaultAccentPhrases が渡された場合 → そのアクセント値（VOICEVOX自動判定）を使用
 *   - defaultAccentPhrases が未指定の場合 → accentPhrases のアクセント値をそのまま維持
 */
export function applyNotationAccents(
  parsedPhrases: ParsedPhrase[],
  accentPhrases: AccentPhrase[],
  defaultAccentPhrases?: AccentPhrase[]
): AccentPhrase[] {
  return accentPhrases.map((phrase, i) => {
    if (i >= parsedPhrases.length) return phrase
    const parsed = parsedPhrases[i]
    if (parsed.bracketCharIndex === null) {
      if (defaultAccentPhrases && i < defaultAccentPhrases.length) {
        return { ...phrase, accent: defaultAccentPhrases[i].accent }
      }
      return phrase
    }
    const newAccent = resolveAccentFromMoras(phrase.moras, parsed.bracketCharIndex, parsed.bracketLength)
    return { ...phrase, accent: newAccent }
  })
}

// ---------------------------------------------------------------------------
// dictionary-utils: 辞書ユーティリティ
// ---------------------------------------------------------------------------

export function isKatakana(input: string): boolean {
  return /^[ァ-ヶー]+$/.test(input)
}

const SMALL_KANA = new Set(['ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヮ'])

/**
 * カタカナ文字列をモーラ単位に分割する。
 * 拗音（ャュョ等）や小書き文字は前の文字と結合して1モーラとする。
 * 長音符「ー」は独立した1モーラとして扱う。
 */
export function splitToMoras(katakana: string): string[] {
  const moras: string[] = []
  for (let i = 0; i < katakana.length; i++) {
    const char = katakana[i]
    if (SMALL_KANA.has(char) && moras.length > 0) {
      moras[moras.length - 1] += char
    } else {
      moras.push(char)
    }
  }
  return moras
}

export function estimateAccentType(pronunciation: string): number {
  return Math.max(1, splitToMoras(pronunciation).length)
}

/**
 * pronunciation と accentType からインライン表記を生成する。
 * 例: insertAccentBrackets("ボイスボックス", 4) → "ボイスボッ[ク]ス"
 * accentType === 0 (平板型) → [] なし
 */
export function insertAccentBrackets(pronunciation: string, accentType: number): string {
  if (accentType === 0) return pronunciation
  const moras = splitToMoras(pronunciation)
  if (accentType < 1 || accentType > moras.length) return pronunciation
  return moras.map((m, i) => (i + 1 === accentType ? `[${m}]` : m)).join('')
}

/**
 * インライン表記 (例: "ボイス[ボッ]クス") をパースして
 * pronunciation (純カタカナ) と accentType (1-based) を返す。
 * `[]` 省略時は estimateAccentType で推定する。
 */
export function parseAccentNotation(notation: string): { pronunciation: string; accentType: number } {
  const parsed = parseNotation(notation)
  if (parsed.length !== 1) {
    throw new Error(`Expected single phrase, got ${parsed.length}. Do not use commas in pronunciation.`)
  }
  const { cleanText, bracketCharIndex, bracketLength } = parsed[0]
  if (bracketCharIndex === null) {
    return { pronunciation: cleanText, accentType: estimateAccentType(cleanText) }
  }
  // bracketCharIndex は文字位置 → モーラ位置に変換
  const moras = splitToMoras(cleanText)
  let charPos = 0
  for (let i = 0; i < moras.length; i++) {
    if (charPos === bracketCharIndex) {
      if (moras[i].length !== bracketLength) {
        throw new Error(
          `Bracket content length (${bracketLength}) does not match mora "${moras[i]}" length (${moras[i].length}). Brackets must enclose exactly one mora.`
        )
      }
      return { pronunciation: cleanText, accentType: i + 1 }
    }
    charPos += moras[i].length
  }
  throw new Error('Bracket position does not align with any mora boundary.')
}

export interface NormalizedDictionaryWord {
  wordUuid: string
  surface: string
  pronunciation: string
  accentType: number
  notation: string
  priority: number
}

export function normalizeUserDictionaryWords(
  dictionary: Record<string, { surface: string; pronunciation: string; accent_type: number; priority: number }>
): NormalizedDictionaryWord[] {
  return Object.entries(dictionary).map(([wordUuid, word]) => ({
    wordUuid,
    surface: word.surface,
    pronunciation: word.pronunciation,
    accentType: word.accent_type,
    notation: insertAccentBrackets(word.pronunciation, word.accent_type),
    priority: word.priority,
  }))
}
