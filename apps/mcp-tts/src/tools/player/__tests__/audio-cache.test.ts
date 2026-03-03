import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => {}),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ size: 0, mtimeMs: 0 })),
  unlink: vi.fn(async () => {}),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { AudioCacheStore, createAudioCacheKey } from '../audio-cache.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AudioCacheConfig = ConstructorParameters<typeof AudioCacheStore>[0]

function makeConfig(overrides: Record<string, unknown> = {}): AudioCacheConfig {
  return {
    playerCacheDir: '/tmp/test-cache',
    playerStateFile: '/tmp/test-cache/player-state.json',
    playerAudioCacheEnabled: true,
    playerAudioCacheTtlDays: 30,
    playerAudioCacheMaxMb: 512,
    ...overrides,
  } as AudioCacheConfig
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// createAudioCacheKey
// ---------------------------------------------------------------------------

describe('createAudioCacheKey', () => {
  it('同じ入力で同じキーを返す', () => {
    const input = { text: 'こんにちは', speaker: 1, speedScale: 1.0 }
    expect(createAudioCacheKey(input)).toBe(createAudioCacheKey(input))
  })

  it('audioQuery あり / なしで異なるキーを返す', () => {
    const base = { text: 'テスト', speaker: 1, speedScale: 1.0 }
    const withQuery = createAudioCacheKey({
      ...base,
      audioQuery: {
        accent_phrases: [],
        speedScale: 1.0,
        pitchScale: 0,
        intonationScale: 1.0,
        volumeScale: 1.0,
        prePhonemeLength: 0.1,
        postPhonemeLength: 0.1,
        outputSamplingRate: 24000,
        outputStereo: false,
      },
    })
    const withoutQuery = createAudioCacheKey(base)
    expect(withQuery).not.toBe(withoutQuery)
  })

  it('speaker が異なれば異なるキーを返す', () => {
    const a = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0 })
    const b = createAudioCacheKey({ text: 'テスト', speaker: 2, speedScale: 1.0 })
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// readCachedBase64
// ---------------------------------------------------------------------------

describe('readCachedBase64', () => {
  it('メモリキャッシュから読み取れる', async () => {
    const store = new AudioCacheStore(makeConfig())
    await store.writeCachedBase64('testkey', 'AAAA')
    expect(store.readCachedBase64('testkey')).toBe('AAAA')
  })

  it('メモリキャッシュミスでディスクから読み取る', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockReturnValue('BBBB\n')

    const store = new AudioCacheStore(makeConfig())
    const result = store.readCachedBase64('diskkey')
    expect(result).toBe('BBBB')
    expect(fs.readFileSync).toHaveBeenCalled()
  })

  it('ディスクキャッシュ無効時はメモリのみ', async () => {
    const fs = await import('node:fs')

    const store = new AudioCacheStore(makeConfig({ playerAudioCacheEnabled: false }))
    const result = store.readCachedBase64('nokey')
    expect(result).toBeNull()
    // readFileSync はディスク読み取りに使われていないこと
    // (constructor 内では呼ばれない)
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// writeCachedBase64
// ---------------------------------------------------------------------------

describe('writeCachedBase64', () => {
  it('メモリ + ディスクに書き込む', async () => {
    const fsPromises = await import('node:fs/promises')

    const store = new AudioCacheStore(makeConfig())
    await store.writeCachedBase64('wkey', 'DATA123')

    // メモリから読める
    expect(store.readCachedBase64('wkey')).toBe('DATA123')
    // ディスクにも書き込まれた
    expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringContaining('wkey.txt'), 'DATA123', 'utf-8')
  })

  it('ディスクキャッシュ無効時はメモリのみに書き込む', async () => {
    const fsPromises = await import('node:fs/promises')

    const store = new AudioCacheStore(makeConfig({ playerAudioCacheEnabled: false }))
    await store.writeCachedBase64('memonly', 'MEMDATA')

    expect(store.readCachedBase64('memonly')).toBe('MEMDATA')
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// AudioCacheStore constructor
// ---------------------------------------------------------------------------

describe('AudioCacheStore constructor', () => {
  it('ディレクトリを作成する', async () => {
    const fs = await import('node:fs')

    new AudioCacheStore(makeConfig({ playerCacheDir: '/tmp/new-cache' }))

    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-cache', { recursive: true })
  })
})

// ---------------------------------------------------------------------------
// getDir
// ---------------------------------------------------------------------------

describe('getDir', () => {
  it('設定されたパスを返す', () => {
    const store = new AudioCacheStore(makeConfig({ playerCacheDir: '/custom/path' }))
    expect(store.getDir()).toBe('/custom/path')
  })
})
