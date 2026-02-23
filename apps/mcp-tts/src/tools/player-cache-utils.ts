export interface AudioCachePolicy {
  isDiskCacheEnabled: boolean
  ttlMs: number | null
  maxBytes: number | null
}

export function resolveAudioCachePolicy(input: {
  enabledFlag: boolean
  ttlDays: number
  maxMb: number
}): AudioCachePolicy {
  const isDiskCacheEnabled = input.enabledFlag && input.ttlDays !== 0 && input.maxMb !== 0
  const ttlMs = input.ttlDays < 0 ? null : input.ttlDays * 24 * 60 * 60 * 1000
  const maxBytes = input.maxMb < 0 ? null : input.maxMb * 1024 * 1024
  return { isDiskCacheEnabled, ttlMs, maxBytes }
}

export function planAudioCacheCleanup(input: {
  entries: Array<{ path: string; size: number; mtimeMs: number }>
  now: number
  ttlMs: number | null
  maxBytes: number | null
}): Set<string> {
  const toDelete = new Set<string>()

  if (input.ttlMs !== null) {
    for (const entry of input.entries) {
      if (input.now - entry.mtimeMs > input.ttlMs) {
        toDelete.add(entry.path)
      }
    }
  }

  if (input.maxBytes !== null) {
    const kept = input.entries.filter((entry) => !toDelete.has(entry.path))
    let totalBytes = kept.reduce((sum, entry) => sum + entry.size, 0)
    if (totalBytes > input.maxBytes) {
      const byOldestFirst = [...kept].sort((a, b) => a.mtimeMs - b.mtimeMs)
      for (const entry of byOldestFirst) {
        if (totalBytes <= input.maxBytes) break
        toDelete.add(entry.path)
        totalBytes -= entry.size
      }
    }
  }

  return toDelete
}
