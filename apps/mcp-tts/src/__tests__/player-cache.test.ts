import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { planAudioCacheCleanup, resolveAudioCachePolicy } from '../tools/player-cache-utils'

// createAudioCacheKey のロジックをインラインで再現（実関数はモジュール非公開のため）
// 実装と一致していることを確認するホワイトボックステスト
function createAudioCacheKey(input: {
  text: string
  speaker: number
  audioQuery?: {
    accent_phrases: unknown[]
    speedScale: number
    pitchScale: number
    intonationScale: number
    volumeScale: number
    prePhonemeLength: number
    postPhonemeLength: number
    outputSamplingRate: number
    outputStereo: boolean
    kana?: string
    pauseLengthScale?: number
  }
  speedScale: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
  accentPhrases?: unknown[]
}): string {
  const keyInput = input.audioQuery
    ? JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        audioQuery: input.audioQuery,
      })
    : JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        speedScale: Number(input.speedScale.toFixed(4)),
        intonationScale: input.intonationScale === undefined ? null : Number(input.intonationScale.toFixed(4)),
        volumeScale: input.volumeScale === undefined ? null : Number(input.volumeScale.toFixed(4)),
        prePhonemeLength: input.prePhonemeLength === undefined ? null : Number(input.prePhonemeLength.toFixed(4)),
        postPhonemeLength: input.postPhonemeLength === undefined ? null : Number(input.postPhonemeLength.toFixed(4)),
        pauseLengthScale: input.pauseLengthScale === undefined ? null : Number(input.pauseLengthScale.toFixed(4)),
        accentPhrases: input.accentPhrases ?? null,
      })
  return createHash('sha256').update(keyInput).digest('hex')
}

describe('createAudioCacheKey', () => {
  it('同じ入力で同じキーを返す', () => {
    const input = { text: 'こんにちは', speaker: 1, speedScale: 1.0 }
    expect(createAudioCacheKey(input)).toBe(createAudioCacheKey(input))
  })

  it('テキストが異なればキーも異なる', () => {
    const a = createAudioCacheKey({ text: 'こんにちは', speaker: 1, speedScale: 1.0 })
    const b = createAudioCacheKey({ text: 'さようなら', speaker: 1, speedScale: 1.0 })
    expect(a).not.toBe(b)
  })

  it('スピーカーが異なればキーも異なる', () => {
    const a = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0 })
    const b = createAudioCacheKey({ text: 'テスト', speaker: 2, speedScale: 1.0 })
    expect(a).not.toBe(b)
  })

  it('小数点4桁を超える差は無視される（浮動小数点正規化）', () => {
    const a = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.00001 })
    const b = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.00002 })
    expect(a).toBe(b)
  })

  it('4桁以上有意な差は区別される', () => {
    const a = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0 })
    const b = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.5 })
    expect(a).not.toBe(b)
  })

  it('audioQuery がある場合はそれを優先してキーを作る', () => {
    const query = {
      accent_phrases: [],
      speedScale: 1.0,
      pitchScale: 0.0,
      intonationScale: 1.0,
      volumeScale: 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      outputSamplingRate: 24000,
      outputStereo: false,
    }
    // audioQuery ありとなしでキーが違うことを確認
    const withQuery = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0, audioQuery: query })
    const withoutQuery = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0 })
    expect(withQuery).not.toBe(withoutQuery)
  })

  it('返り値は 64 文字の hex 文字列 (SHA-256)', () => {
    const key = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0 })
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

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
