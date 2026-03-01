import type { AccentPhrase, Mora } from '@kajidog/voicevox-client'

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
