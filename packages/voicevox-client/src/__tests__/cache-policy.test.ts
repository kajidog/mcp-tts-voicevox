import { describe, expect, it } from 'vitest'
import { planAudioCacheCleanup, resolveAudioCachePolicy } from '../cache-policy'

describe('resolveAudioCachePolicy', () => {
  it('enabled + 正のTTL/容量でディスクキャッシュ有効', () => {
    const result = resolveAudioCachePolicy({ enabledFlag: true, ttlDays: 30, maxMb: 512 })
    expect(result.isDiskCacheEnabled).toBe(true)
    expect(result.ttlMs).toBe(30 * 24 * 60 * 60 * 1000)
    expect(result.maxBytes).toBe(512 * 1024 * 1024)
  })

  it('TTL=0 でディスクキャッシュ無効', () => {
    const result = resolveAudioCachePolicy({ enabledFlag: true, ttlDays: 0, maxMb: 512 })
    expect(result.isDiskCacheEnabled).toBe(false)
  })

  it('MAX_MB=0 でディスクキャッシュ無効', () => {
    const result = resolveAudioCachePolicy({ enabledFlag: true, ttlDays: 30, maxMb: 0 })
    expect(result.isDiskCacheEnabled).toBe(false)
  })

  it('enabledFlag=false でディスクキャッシュ無効', () => {
    const result = resolveAudioCachePolicy({ enabledFlag: false, ttlDays: 30, maxMb: 512 })
    expect(result.isDiskCacheEnabled).toBe(false)
  })

  it('-1 指定は無制限として解釈', () => {
    const result = resolveAudioCachePolicy({ enabledFlag: true, ttlDays: -1, maxMb: -1 })
    expect(result.isDiskCacheEnabled).toBe(true)
    expect(result.ttlMs).toBeNull()
    expect(result.maxBytes).toBeNull()
  })
})

describe('planAudioCacheCleanup', () => {
  const now = Date.now()

  it('TTL超過ファイルを削除対象にする', () => {
    const deleted = planAudioCacheCleanup({
      entries: [
        { path: 'old.txt', size: 10, mtimeMs: now - 10_000 },
        { path: 'new.txt', size: 10, mtimeMs: now - 100 },
      ],
      now,
      ttlMs: 5_000,
      maxBytes: null,
    })
    expect(deleted.has('old.txt')).toBe(true)
    expect(deleted.has('new.txt')).toBe(false)
  })

  it('容量上限超過時は古い順に削除する', () => {
    const deleted = planAudioCacheCleanup({
      entries: [
        { path: 'a.txt', size: 6, mtimeMs: now - 3000 },
        { path: 'b.txt', size: 6, mtimeMs: now - 2000 },
        { path: 'c.txt', size: 6, mtimeMs: now - 1000 },
      ],
      now,
      ttlMs: null,
      maxBytes: 12,
    })
    expect(deleted.has('a.txt')).toBe(true)
    expect(deleted.has('b.txt')).toBe(false)
    expect(deleted.has('c.txt')).toBe(false)
  })

  it('TTL削除と容量削除を合成して判定する', () => {
    const deleted = planAudioCacheCleanup({
      entries: [
        { path: 'expired.txt', size: 10, mtimeMs: now - 10_000 },
        { path: 'old.txt', size: 8, mtimeMs: now - 2_000 },
        { path: 'new.txt', size: 8, mtimeMs: now - 1_000 },
      ],
      now,
      ttlMs: 5_000,
      maxBytes: 8,
    })
    expect(deleted.has('expired.txt')).toBe(true)
    expect(deleted.has('old.txt')).toBe(true)
    expect(deleted.has('new.txt')).toBe(false)
  })
})
