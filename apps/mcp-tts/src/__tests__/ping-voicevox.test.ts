import { beforeEach, describe, expect, it, vi } from 'vitest'

// VoicevoxClientをモック
const mockCheckHealth = vi.fn()

vi.mock('@kajidog/voicevox-client', () => ({
  VoicevoxClient: vi.fn().mockImplementation(() => ({
    checkHealth: mockCheckHealth,
    speak: vi.fn(),
    generateQuery: vi.fn(),
    generateAudioFile: vi.fn(),
    enqueueAudioGeneration: vi.fn(),
    clearQueue: vi.fn(),
    getSpeakers: vi.fn(),
    getSpeakerInfo: vi.fn(),
  })),
}))

// configモジュールをモック
vi.mock('../config', () => ({
  getConfig: vi.fn().mockReturnValue({
    voicevoxUrl: 'http://localhost:50021',
    defaultSpeaker: 1,
    defaultSpeedScale: 1.0,
    defaultImmediate: true,
    defaultWaitForStart: false,
    defaultWaitForEnd: false,
    restrictImmediate: false,
    restrictWaitForStart: false,
    restrictWaitForEnd: false,
    disabledTools: [],
    httpMode: false,
    httpPort: 3000,
    httpHost: '0.0.0.0',
  }),
}))

describe('ping tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('checkHealth が接続成功を返すとき成功情報を含む', async () => {
    mockCheckHealth.mockResolvedValue({
      connected: true,
      version: '0.14.0',
      url: 'http://localhost:50021',
    })

    const result = await mockCheckHealth()
    expect(result.connected).toBe(true)
    expect(result.version).toBe('0.14.0')
    expect(result.url).toBe('http://localhost:50021')
  })

  it('checkHealth が接続失敗を返すとき connected=false', async () => {
    mockCheckHealth.mockResolvedValue({
      connected: false,
      url: 'http://localhost:50021',
    })

    const result = await mockCheckHealth()
    expect(result.connected).toBe(false)
    expect(result.url).toBe('http://localhost:50021')
  })

  it('checkHealth が正しい形式のレスポンスを返す', async () => {
    mockCheckHealth.mockResolvedValue({
      connected: true,
      version: '0.15.0',
      url: 'http://localhost:50021',
    })

    const result = await mockCheckHealth()
    expect(result).toHaveProperty('connected')
    expect(result).toHaveProperty('url')
  })
})
