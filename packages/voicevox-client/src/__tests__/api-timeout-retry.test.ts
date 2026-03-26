import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxApi } from '../api'

const BASE_URL = 'http://localhost:50021'

function makeTimeoutError(): DOMException {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError')
}

function makeAbortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError')
}

function makeNetworkError(): TypeError {
  return new TypeError('Failed to fetch')
}

describe('VoicevoxApi - timeout and retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('timeout configuration', () => {
    it('デフォルトのタイムアウト（30秒）を使用する', async () => {
      const api = new VoicevoxApi(BASE_URL)
      const abortSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('1', { status: 200 }))

      await api.checkHealth()

      expect(abortSpy).toHaveBeenCalledWith(30000)
    })

    it('カスタムタイムアウトを使用する', async () => {
      const api = new VoicevoxApi(BASE_URL, { timeout: 5000 })
      const abortSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('1', { status: 200 }))

      await api.checkHealth()

      expect(abortSpy).toHaveBeenCalledWith(5000)
    })
  })

  describe('retry on transient errors', () => {
    it('タイムアウトエラー時にリトライする', async () => {
      const api = new VoicevoxApi(BASE_URL, { retryCount: 2, retryDelay: 100 })
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(makeTimeoutError())
        .mockRejectedValueOnce(makeTimeoutError())
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      const promise = api.getSpeakers()
      await vi.runAllTimersAsync()
      const result = await promise

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(result).toEqual([])
    })

    it('AbortErrorエラー時にリトライする', async () => {
      const api = new VoicevoxApi(BASE_URL, { retryCount: 1, retryDelay: 100 })
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(makeAbortError())
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      const promise = api.getSpeakers()
      await vi.runAllTimersAsync()
      const result = await promise

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(result).toEqual([])
    })

    it('ネットワークエラー時にリトライする', async () => {
      const api = new VoicevoxApi(BASE_URL, { retryCount: 1, retryDelay: 100 })
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(makeNetworkError())
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      const promise = api.getSpeakers()
      await vi.runAllTimersAsync()
      const result = await promise

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(result).toEqual([])
    })

    it('リトライ回数を超えたらエラーをスローする', async () => {
      const api = new VoicevoxApi(BASE_URL, { retryCount: 2, retryDelay: 100 })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(makeTimeoutError())

      const promise = api.getSpeakers()
      // リジェクション未処理警告を防ぐため先にキャッチャーを登録
      const caught = promise.catch((e) => e)
      await vi.runAllTimersAsync()
      const error = await caught

      // 初回 + 2回リトライ = 計3回
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('no retry on non-transient errors', () => {
    it('HTTP 4xxエラーはリトライしない', async () => {
      const api = new VoicevoxApi(BASE_URL, { retryCount: 3, retryDelay: 100 })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad Request', { status: 400 }))

      await expect(api.getSpeakers()).rejects.toThrow()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('HTTP 5xxエラーはリトライしない', async () => {
      const api = new VoicevoxApi(BASE_URL, { retryCount: 3, retryDelay: 100 })
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

      await expect(api.getSpeakers()).rejects.toThrow()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry delay', () => {
    it('リトライ間隔を指定した時間待機する', async () => {
      const retryDelay = 500
      const api = new VoicevoxApi(BASE_URL, { retryCount: 1, retryDelay })
      vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(makeTimeoutError())
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      let resolved = false
      const promise = api.getSpeakers().then((r) => {
        resolved = true
        return r
      })

      // 遅延前はまだ解決していない
      await vi.advanceTimersByTimeAsync(retryDelay - 1)
      expect(resolved).toBe(false)

      // 遅延後に解決する
      await vi.advanceTimersByTimeAsync(1)
      await promise
      expect(resolved).toBe(true)
    })
  })

  describe('default behavior (no retry)', () => {
    it('リトライ設定なしの場合、失敗時は即座にエラーをスローする', async () => {
      const api = new VoicevoxApi(BASE_URL)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(makeTimeoutError())

      await expect(api.getSpeakers()).rejects.toThrow()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })
})
