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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  DEFAULT_STATE_PAGE_LIMIT,
  MAX_STATE_PAGE_LIMIT,
  MAX_TOOL_CONTENT_BYTES,
  type PlayerSessionState,
  SessionStateStore,
} from '../session-state.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SessionStateConfig = ConstructorParameters<typeof SessionStateStore>[0]

function makeConfig(overrides: Record<string, unknown> = {}): SessionStateConfig {
  return {
    playerCacheDir: '/tmp/test-cache',
    playerStateFile: '',
    playerAudioCacheEnabled: true,
    playerAudioCacheTtlDays: 30,
    playerAudioCacheMaxMb: 512,
    ...overrides,
  } as SessionStateConfig
}

function makeState(overrides: Record<string, unknown> = {}): PlayerSessionState {
  return {
    segments: [{ text: 'テスト', speaker: 1, speedScale: 1.0 }],
    updatedAt: Date.now(),
    ...overrides,
  } as PlayerSessionState
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// set / getByKey
// ---------------------------------------------------------------------------

describe('set / getByKey', () => {
  it('状態を保存し getByKey で取得できる', () => {
    vi.useFakeTimers()
    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')
    const state = makeState()

    store.set('view-1', state)
    expect(store.getByKey('view-1')).toBe(state)

    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('get', () => {
  it('viewUUID 優先で検索する', () => {
    vi.useFakeTimers()
    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')
    const stateA = makeState({ segments: [{ text: 'A', speaker: 1, speedScale: 1.0 }] })
    const stateB = makeState({ segments: [{ text: 'B', speaker: 1, speedScale: 1.0 }] })

    store.set('view-uuid', stateA)
    store.set('session-id', stateB)

    const result = store.get('view-uuid', 'session-id')
    expect(result).toBe(stateA)

    vi.useRealTimers()
  })

  it('viewUUID なしで sessionId にフォールバック', () => {
    vi.useFakeTimers()
    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')
    const state = makeState()

    store.set('my-session', state)

    const result = store.get(undefined, 'my-session')
    expect(result).toBe(state)

    vi.useRealTimers()
  })

  it('両方なしで "global" キーにフォールバック', () => {
    vi.useFakeTimers()
    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')
    const state = makeState()

    store.set('global', state)

    const result = store.get(undefined, undefined)
    expect(result).toBe(state)

    vi.useRealTimers()
  })

  it('存在しないキーで undefined を返す', () => {
    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')
    const result = store.get('nonexistent', 'also-nonexistent')
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// constructor (disk restore)
// ---------------------------------------------------------------------------

describe('SessionStateStore constructor', () => {
  it('ディスクから状態を復元する', async () => {
    const fs = await import('node:fs')
    const savedState = {
      version: 1,
      savedAt: Date.now(),
      entries: [['restored-key', { segments: [{ text: '復元', speaker: 1, speedScale: 1.0 }], updatedAt: Date.now() }]],
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState))

    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')

    expect(store.getByKey('restored-key')).toBeDefined()
    expect(store.getByKey('restored-key')?.segments[0].text).toBe('復元')
  })

  it('ファイルが無い場合は空状態で起動する', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const store = new SessionStateStore(makeConfig(), '/tmp/test-cache')

    expect(store.getByKey('any-key')).toBeUndefined()
  })

  it('ディレクトリを作成する', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    new SessionStateStore(makeConfig({ playerStateFile: '/custom/dir/state.json' }), '/tmp/test-cache')

    expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/dir', { recursive: true })
  })
})

// ---------------------------------------------------------------------------
// 定数エクスポート
// ---------------------------------------------------------------------------

describe('定数エクスポート', () => {
  it('定数が正しい値でエクスポートされている', () => {
    expect(MAX_TOOL_CONTENT_BYTES).toBe(1024 * 1024)
    expect(DEFAULT_STATE_PAGE_LIMIT).toBe(100)
    expect(MAX_STATE_PAGE_LIMIT).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// debounce 保存
// ---------------------------------------------------------------------------

describe('debounce 保存', () => {
  it('set 後に debounce でディスク保存がスケジュールされる', async () => {
    vi.useFakeTimers()
    const fsPromises = await import('node:fs/promises')

    const store = new SessionStateStore(makeConfig({ playerStateFile: '/tmp/state.json' }), '/tmp/test-cache')
    store.set('debounce-test', makeState())

    // まだ保存されていない
    expect(fsPromises.writeFile).not.toHaveBeenCalled()

    // 300ms 後に保存される
    await vi.advanceTimersByTimeAsync(300)

    expect(fsPromises.writeFile).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
