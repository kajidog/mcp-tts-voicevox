import type { AccentPhrase } from '@kajidog/voicevox-client'

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
