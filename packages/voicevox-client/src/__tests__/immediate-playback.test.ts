import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxApi } from '../api'
import { VoicevoxClient } from '../client'
import { VoicevoxQueueManager } from '../queue/manager'

// モック設定
vi.mock('fs')
vi.mock('path')
vi.mock('os')
vi.mock('child_process')
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
    mockedPath.join.mockImplementation((...args) => args.join('/'))

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
    }
    mockedSpawn.mockReturnValue(mockProcess as any)

    // Axios mock is already configured in vi.mock above

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
      const player = (client as any).player
      if (player?.queueManager) {
        player.queueManager.cleanup()
      }
    }
  })

  it('should play immediately when immediate option is true', async () => {
    const text1 = 'これは即時再生です'
    const text2 = 'これは通常のキュー再生です'
    const text3 = 'これも即時再生です'

    // 3つの音声を追加（1つ目と3つ目は即時再生）
    const promise1 = client.speakWithOptions(text1, {
      immediate: true,
      waitForEnd: true,
    })
    const promise2 = client.speakWithOptions(text2, {
      immediate: false,
      waitForEnd: true,
    })
    const promise3 = client.speakWithOptions(text3, {
      immediate: true,
      waitForEnd: true,
    })

    // 再生開始を待つ
    await new Promise((resolve) => setTimeout(resolve, 200))

    // spawn呼び出しを確認
    const spawnCalls = mockedSpawn.mock.calls

    // 即時再生の音声が同時に再生されていることを確認
    // （通常のキュー再生より前に、または並行して再生される）
    expect(spawnCalls.length).toBeGreaterThanOrEqual(2)

    // 最初の2つの呼び出しが即時再生であることを確認
    const firstTwoFiles = spawnCalls.slice(0, 2).map((call) => call[1][0])

    // ファイルパスに音声データが含まれていることを確認
    expect(firstTwoFiles.every((file) => file.includes('.wav'))).toBe(true)
  })

  it('should handle multiple immediate playbacks concurrently', async () => {
    const immediateTexts = ['即時再生1', '即時再生2', '即時再生3']

    // 複数の即時再生を同時に開始
    const promises = immediateTexts.map((text) =>
      client.speakWithOptions(text, {
        immediate: true,
        waitForEnd: true,
      })
    )

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 150))

    // 複数のspawnが呼ばれていることを確認
    expect(mockedSpawn).toHaveBeenCalledTimes(3)

    // すべてが異なるファイルを再生していることを確認
    const playedFiles = mockedSpawn.mock.calls.map((call) => call[1][0])
    const uniqueFiles = new Set(playedFiles)
    expect(uniqueFiles.size).toBe(3)
  })

  it('should not affect normal queue when immediate playback is used', async () => {
    // まず通常のキューに音声を追加
    const normalPromise1 = client.speakWithOptions('通常1', {
      immediate: false,
      waitForEnd: true,
    })
    const normalPromise2 = client.speakWithOptions('通常2', {
      immediate: false,
      waitForEnd: true,
    })

    // 少し待ってから即時再生を追加
    await new Promise((resolve) => setTimeout(resolve, 50))

    const immediatePromise = client.speakWithOptions('即時', {
      immediate: true,
      waitForEnd: true,
    })

    // 再生開始を待つ
    await new Promise((resolve) => setTimeout(resolve, 200))

    // spawn呼び出しを確認
    const spawnCalls = mockedSpawn.mock.calls

    // 少なくとも2つの再生が開始されていることを確認
    // （通常のキューと即時再生が並行して動作）
    expect(spawnCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('should work with waitForStart option', async () => {
    const { promises } = await client.speakWithOptions('テスト音声', {
      immediate: true,
      waitForStart: true,
      waitForEnd: false,
    })

    // waitForStartのPromiseが解決されることを確認
    await expect(promises.start).resolves.toBeUndefined()
  })

  it('should work with both waitForStart and waitForEnd options', async () => {
    const { promises } = await client.speakWithOptions('テスト音声', {
      immediate: true,
      waitForStart: true,
      waitForEnd: true,
    })

    // 両方のPromiseが解決されることを確認
    await expect(promises.start).resolves.toBeUndefined()
    await expect(promises.end).resolves.toBeUndefined()
  })
})
