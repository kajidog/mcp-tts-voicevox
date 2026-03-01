import { parseNotation } from '../player/phrase-utils.js'

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
  priority: number
}

export function normalizeUserDictionaryWords(
  dictionary: Record<string, { surface: string; pronunciation: string; accent_type: number; priority: number }>
): NormalizedDictionaryWord[] {
  return Object.entries(dictionary).map(([wordUuid, word]) => ({
    wordUuid,
    surface: word.surface,
    pronunciation: insertAccentBrackets(word.pronunciation, word.accent_type),
    priority: word.priority,
  }))
}
