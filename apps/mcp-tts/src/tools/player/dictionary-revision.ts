let playerDictionaryRevision = 0

export function bumpPlayerDictionaryRevision(): void {
  playerDictionaryRevision += 1
}

export function getPlayerDictionaryRevision(): number {
  return playerDictionaryRevision
}
