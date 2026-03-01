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
  rename: vi.fn(async () => {}),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    playerCacheDir: '/tmp/test-cache',
    playerStateFile: '',
    playerAudioCacheEnabled: true,
    playerAudioCacheTtlDays: 30,
    playerAudioCacheMaxMb: 512,
    ...overrides,
  } as Parameters<typeof import('../tools/player-session-state')['initializeSessionState']>[0]
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    segments: [{ text: 'テスト', speaker: 1, speedScale: 1.0 }],
    updatedAt: Date.now(),
    ...overrides,
  } as import('../tools/player-session-state').PlayerSessionState
}

beforeEach(async () => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// setSessionState / getSessionStateByKey
// ---------------------------------------------------------------------------

describe('setSessionState / getSessionStateByKey', () => {
  it('状態を保存し getSessionStateByKey で取得できる', async () => {
    vi.useFakeTimers()
    const mod = await import('../tools/player-session-state')
    const state = makeState()

    mod.setSessionState('view-1', state)
    expect(mod.getSessionStateByKey('view-1')).toBe(state)

    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// getSessionState
// ---------------------------------------------------------------------------

describe('getSessionState', () => {
  it('viewUUID 優先で検索する', async () => {
    vi.useFakeTimers()
    const mod = await import('../tools/player-session-state')
    const stateA = makeState({ segments: [{ text: 'A', speaker: 1, speedScale: 1.0 }] })
    const stateB = makeState({ segments: [{ text: 'B', speaker: 1, speedScale: 1.0 }] })

    mod.setSessionState('view-uuid', stateA)
    mod.setSessionState('session-id', stateB)

    const result = mod.getSessionState('view-uuid', 'session-id')
    expect(result).toBe(stateA)

    vi.useRealTimers()
  })

  it('viewUUID なしで sessionId にフォールバック', async () => {
    vi.useFakeTimers()
    const mod = await import('../tools/player-session-state')
    const state = makeState()

    mod.setSessionState('my-session', state)

    const result = mod.getSessionState(undefined, 'my-session')
    expect(result).toBe(state)

    vi.useRealTimers()
  })

  it('両方なしで "global" キーにフォールバック', async () => {
    vi.useFakeTimers()
    const mod = await import('../tools/player-session-state')
    const state = makeState()

    mod.setSessionState('global', state)

    const result = mod.getSessionState(undefined, undefined)
    expect(result).toBe(state)

    vi.useRealTimers()
  })

  it('存在しないキーで undefined を返す', async () => {
    const mod = await import('../tools/player-session-state')
    const result = mod.getSessionState('nonexistent', 'also-nonexistent')
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// initializeSessionState
// ---------------------------------------------------------------------------

describe('initializeSessionState', () => {
  it('ディスクから状態を復元する', async () => {
    const fs = await import('node:fs')
    const savedState = {
      version: 1,
      savedAt: Date.now(),
      entries: [['restored-key', { segments: [{ text: '復元', speaker: 1, speedScale: 1.0 }], updatedAt: Date.now() }]],
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState))

    const mod = await import('../tools/player-session-state')
    mod.initializeSessionState(makeConfig(), '/tmp/test-cache')

    expect(mod.getSessionStateByKey('restored-key')).toBeDefined()
    expect(mod.getSessionStateByKey('restored-key')?.segments[0].text).toBe('復元')
  })

  it('ファイルが無い場合は空状態で起動する', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const mod = await import('../tools/player-session-state')
    mod.initializeSessionState(makeConfig(), '/tmp/test-cache')

    expect(mod.getSessionStateByKey('any-key')).toBeUndefined()
  })

  it('ディレクトリを作成する', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const mod = await import('../tools/player-session-state')
    mod.initializeSessionState(makeConfig({ playerStateFile: '/custom/dir/state.json' }), '/tmp/test-cache')

    expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/dir', { recursive: true })
  })
})

// ---------------------------------------------------------------------------
// 定数エクスポート
// ---------------------------------------------------------------------------

describe('定数エクスポート', () => {
  it('定数が正しい値でエクスポートされている', async () => {
    const mod = await import('../tools/player-session-state')
    expect(mod.MAX_TOOL_CONTENT_BYTES).toBe(1024 * 1024)
    expect(mod.DEFAULT_STATE_PAGE_LIMIT).toBe(100)
    expect(mod.MAX_STATE_PAGE_LIMIT).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// debounce 保存
// ---------------------------------------------------------------------------

describe('debounce 保存', () => {
  it('setSessionState 後に debounce でディスク保存がスケジュールされる', async () => {
    vi.useFakeTimers()
    const fsPromises = await import('node:fs/promises')

    const mod = await import('../tools/player-session-state')
    mod.initializeSessionState(makeConfig({ playerStateFile: '/tmp/state.json' }), '/tmp/test-cache')
    mod.setSessionState('debounce-test', makeState())

    // まだ保存されていない
    expect(fsPromises.writeFile).not.toHaveBeenCalled()

    // 300ms 後に保存される
    await vi.advanceTimersByTimeAsync(300)

    expect(fsPromises.writeFile).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
