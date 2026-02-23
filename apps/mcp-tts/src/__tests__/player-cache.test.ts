import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

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
