import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxApi } from '../api'

const BASE_URL = 'http://localhost:50021'

// テスト高速化のためディレイは 1ms にする
const createApi = (retryCount?: number) => new VoicevoxApi(BASE_URL, { retryCount, retryDelayMs: 1 })

describe('VoicevoxApi - retry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // handleError / makeRequest 内の console.error 出力を抑制
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('5xx が続いた後に成功したら結果を返す（500 → 500 → 200）', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(new Response('"0.15.0"', { status: 200 }))

    const result = await createApi().checkHealth()

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result.connected).toBe(true)
    expect(result.version).toBe('0.15.0')
  })

  it('ネットワークエラーはリトライして成功する', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    const result = await createApi().getSpeakers()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result).toEqual([])
  })

  it('4xx はリトライせず即時エラーになる', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad request', { status: 400 }))

    await expect(createApi().getSpeakers()).rejects.toThrow('400')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('429 はリトライ対象になる', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('too many requests', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    const result = await createApi().getSpeakers()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result).toEqual([])
  })

  it('全試行が失敗したら retryCount + 1 回試行してエラーを投げる', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await expect(createApi(2).getSpeakers()).rejects.toThrow('fetch failed')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('retryCount: 0 の場合はリトライしない', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 503 }))

    await expect(createApi(0).getSpeakers()).rejects.toThrow('503')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('非冪等な addUserDictionaryWord はネットワークエラーでもリトライしない', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      createApi().addUserDictionaryWord({
        surface: 'テスト',
        pronunciation: 'テスト',
        accentType: 1,
        priority: 5,
      })
    ).rejects.toThrow()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
