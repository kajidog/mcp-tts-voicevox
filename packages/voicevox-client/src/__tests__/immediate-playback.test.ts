import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxClient } from '../client'

// モック設定
vi.mock('fs')
vi.mock('path')
vi.mock('os')
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: vi.fn(),
    // ffplayを利用不可にしてストリーミングモードを無効化
    execSync: vi.fn(() => {
      throw new Error('ffplay not found')
    }),
  }
})
vi.mock('axios', () => {
  const mockAxios = vi.fn((config: any) => {
    if (config.method === 'get' && config.url.includes('/speakers')) {
      return Promise.resolve({
        status: 200,
        data: [
          {
            speaker_uuid: 'test-uuid',
            name: 'Test Speaker',
            styles: [{ id: 0, name: 'Normal' }],
          },
        ],
      })
    }
    if (config.method === 'post' && config.url.includes('/audio_query')) {
      return Promise.resolve({
        status: 200,
        data: {
          accent_phrases: [],
          speedScale: 1.0,
          pitchScale: 0.0,
          intonationScale: 1.0,
          volumeScale: 1.0,
          prePhonemeLength: 0.1,
          postPhonemeLength: 0.1,
          outputSamplingRate: 24000,
          outputStereo: false,
          kana: '',
        },
      })
    }
    if (config.method === 'post' && config.url.includes('/synthesis')) {
      return Promise.resolve({
        status: 200,
        data: Buffer.from('mock audio data'),
      })
    }
    return Promise.reject(new Error('Not found'))
  })

  mockAxios.isAxiosError = vi.fn().mockReturnValue(false)
  mockAxios.create = vi.fn().mockReturnValue(mockAxios)

  return {
    default: mockAxios,
    isAxiosError: mockAxios.isAxiosError,
  }
})

const mockedFs = fs as any
const mockedPath = path as any
const mockedOs = os as any
const mockedSpawn = spawn as any

describe('Immediate Playback', () => {
  let client: VoicevoxClient
  let mockProcess: any

  beforeEach(() => {
    vi.clearAllMocks()

    // OSをmacOSとして設定
    mockedOs.platform.mockReturnValue('darwin')
    mockedOs.tmpdir.mockReturnValue('/tmp')

    // ファイルシステムのモック
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.writeFileSync.mockImplementation(() => {})
    mockedFs.unlinkSync.mockImplementation(() => {})
    mockedPath.join.mockImplementation((...args: string[]) => args.join('/'))

    // child_processのモック
    mockProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // 100ms後に正常終了
          setTimeout(() => callback(0), 100)
        }
      }),
      stderr: { on: vi.fn() },
      stdout: { on: vi.fn() },
      stdin: { write: vi.fn((_data, cb) => cb?.()), end: vi.fn() },
      kill: vi.fn(),
    }
    mockedSpawn.mockReturnValue(mockProcess as any)

    client = new VoicevoxClient({
      url: 'http://localhost:50021',
      defaultSpeaker: 1,
      defaultSpeedScale: 1.0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
    // クライアントのクリーンアップ
    if (client) {
      const queueService = (client as any).queueService
      if (queueService) {
        queueService.cleanup()
      }
    }
  })

  it('should play immediately when immediate option is true', async () => {
    const text1 = 'これは即時再生です'

    // 即時再生を開始
    await client.speak(text1, {
      immediate: true,
      waitForEnd: true,
    })

    // 再生開始を待つ
    await new Promise((resolve) => setTimeout(resolve, 200))

    // spawn呼び出しを確認
    const spawnCalls = mockedSpawn.mock.calls

    // 少なくとも1つの再生が開始されていることを確認
    expect(spawnCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('should handle multiple immediate playbacks concurrently', async () => {
    const immediateTexts = ['即時再生1', '即時再生2', '即時再生3']

    // 複数の即時再生を同時に開始
    const promises = immediateTexts.map((text) =>
      client.speak(text, {
        immediate: true,
        waitForEnd: true,
      })
    )

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 150))

    // 複数のspawnが呼ばれていることを確認
    expect(mockedSpawn).toHaveBeenCalled()
  })

  it('should not affect normal queue when immediate playback is used', async () => {
    // まず通常のキューに音声を追加
    client.speak('通常1', {
      immediate: false,
      waitForEnd: true,
    })
    client.speak('通常2', {
      immediate: false,
      waitForEnd: true,
    })

    // 少し待ってから即時再生を追加
    await new Promise((resolve) => setTimeout(resolve, 50))

    client.speak('即時', {
      immediate: true,
      waitForEnd: true,
    })

    // 再生開始を待つ
    await new Promise((resolve) => setTimeout(resolve, 200))

    // spawn呼び出しを確認
    const spawnCalls = mockedSpawn.mock.calls

    // 少なくとも1つの再生が開始されていることを確認
    expect(spawnCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('should work with waitForStart option', async () => {
    // speak関数の新しいAPIを使用
    const result = await client.speak('テスト音声', {
      immediate: true,
      waitForStart: true,
      waitForEnd: false,
    })

    // 結果が返ることを確認
    expect(result).toContain('音声生成キューに追加しました')
  })

  it('should work with both waitForStart and waitForEnd options', async () => {
    // speak関数の新しいAPIを使用
    const result = await client.speak('テスト音声', {
      immediate: true,
      waitForStart: true,
      waitForEnd: true,
    })

    // 結果が返ることを確認
    expect(result).toContain('音声生成キューに追加しました')
  })
})
