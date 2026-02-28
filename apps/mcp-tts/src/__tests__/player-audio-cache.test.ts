import { join } from 'node:path'
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
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    playerCacheDir: '/tmp/test-cache',
    playerStateFile: '/tmp/test-cache/player-state.json',
    playerAudioCacheEnabled: true,
    playerAudioCacheTtlDays: 30,
    playerAudioCacheMaxMb: 512,
    ...overrides,
  } as Parameters<typeof import('../tools/player-audio-cache')['initializeAudioCache']>[0]
}

beforeEach(async () => {
  vi.resetModules()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// createAudioCacheKey
// ---------------------------------------------------------------------------

describe('createAudioCacheKey', () => {
  it('同じ入力で同じキーを返す', async () => {
    const { createAudioCacheKey } = await import('../tools/player-audio-cache')
    const input = { text: 'こんにちは', speaker: 1, speedScale: 1.0 }
    expect(createAudioCacheKey(input)).toBe(createAudioCacheKey(input))
  })

  it('audioQuery あり / なしで異なるキーを返す', async () => {
    const { createAudioCacheKey } = await import('../tools/player-audio-cache')
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

  it('speaker が異なれば異なるキーを返す', async () => {
    const { createAudioCacheKey } = await import('../tools/player-audio-cache')
    const a = createAudioCacheKey({ text: 'テスト', speaker: 1, speedScale: 1.0 })
    const b = createAudioCacheKey({ text: 'テスト', speaker: 2, speedScale: 1.0 })
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// readCachedAudioBase64
// ---------------------------------------------------------------------------

describe('readCachedAudioBase64', () => {
  it('メモリキャッシュから読み取れる', async () => {
    const mod = await import('../tools/player-audio-cache')
    // initializeAudioCache でディスクキャッシュ有効化
    mod.initializeAudioCache(makeConfig())
    // writeCachedAudioBase64 でメモリに書き込み
    await mod.writeCachedAudioBase64('testkey', 'AAAA')
    expect(mod.readCachedAudioBase64('testkey')).toBe('AAAA')
  })

  it('メモリキャッシュミスでディスクから読み取る', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockReturnValue('BBBB\n')

    const mod = await import('../tools/player-audio-cache')
    mod.initializeAudioCache(makeConfig())
    const result = mod.readCachedAudioBase64('diskkey')
    expect(result).toBe('BBBB')
    expect(fs.readFileSync).toHaveBeenCalled()
  })

  it('ディスクキャッシュ無効時はメモリのみ', async () => {
    const fs = await import('node:fs')

    const mod = await import('../tools/player-audio-cache')
    mod.initializeAudioCache(makeConfig({ playerAudioCacheEnabled: false }))
    const result = mod.readCachedAudioBase64('nokey')
    expect(result).toBeNull()
    // readFileSync はディスク読み取りに使われていないこと
    // (initializeAudioCache 内では呼ばれない)
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// writeCachedAudioBase64
// ---------------------------------------------------------------------------

describe('writeCachedAudioBase64', () => {
  it('メモリ + ディスクに書き込む', async () => {
    const fsPromises = await import('node:fs/promises')

    const mod = await import('../tools/player-audio-cache')
    mod.initializeAudioCache(makeConfig())
    await mod.writeCachedAudioBase64('wkey', 'DATA123')

    // メモリから読める
    expect(mod.readCachedAudioBase64('wkey')).toBe('DATA123')
    // ディスクにも書き込まれた
    expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringContaining('wkey.txt'), 'DATA123', 'utf-8')
  })

  it('ディスクキャッシュ無効時はメモリのみに書き込む', async () => {
    const fsPromises = await import('node:fs/promises')

    const mod = await import('../tools/player-audio-cache')
    mod.initializeAudioCache(makeConfig({ playerAudioCacheEnabled: false }))
    await mod.writeCachedAudioBase64('memonly', 'MEMDATA')

    expect(mod.readCachedAudioBase64('memonly')).toBe('MEMDATA')
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// initializeAudioCache
// ---------------------------------------------------------------------------

describe('initializeAudioCache', () => {
  it('ディレクトリを作成する', async () => {
    const fs = await import('node:fs')

    const mod = await import('../tools/player-audio-cache')
    mod.initializeAudioCache(makeConfig({ playerCacheDir: '/tmp/new-cache' }))

    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-cache', { recursive: true })
  })
})

// ---------------------------------------------------------------------------
// getAudioCacheDir
// ---------------------------------------------------------------------------

describe('getAudioCacheDir', () => {
  it('デフォルトパスを返す', async () => {
    const mod = await import('../tools/player-audio-cache')
    const dir = mod.getAudioCacheDir()
    expect(dir).toBe(join(process.cwd(), '.voicevox-player-cache'))
  })

  it('initializeAudioCache 後は設定されたパスを返す', async () => {
    const mod = await import('../tools/player-audio-cache')
    mod.initializeAudioCache(makeConfig({ playerCacheDir: '/custom/path' }))
    expect(mod.getAudioCacheDir()).toBe('/custom/path')
  })
})
