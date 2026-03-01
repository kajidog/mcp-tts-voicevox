export function isKatakana(input: string): boolean {
  return /^[ァ-ヶー]+$/.test(input)
}

export function estimateAccentType(pronunciation: string): number {
  const smallKana = new Set(['ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヮ'])
  let moraCount = 0
  for (const char of pronunciation) {
    if (char === 'ー') continue
    if (smallKana.has(char)) continue
    moraCount += 1
  }
  return Math.max(1, moraCount)
}

export function normalizeUserDictionaryWords(
  dictionary: Record<string, { surface: string; pronunciation: string; accent_type: number; priority: number }>
) {
  return Object.entries(dictionary).map(([wordUuid, word]) => ({
    wordUuid,
    surface: word.surface,
    pronunciation: word.pronunciation,
    accentType: word.accent_type,
    priority: word.priority,
  }))
}
