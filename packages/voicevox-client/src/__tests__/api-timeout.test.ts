import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxApi } from '../api'
import { VoicevoxClient } from '../client'

const BASE_URL = 'http://localhost:50021'

describe('VoicevoxApi - timeout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('"0.15.0"', { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('timeoutMs 未指定ならデフォルトの 30000ms を使う', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    await new VoicevoxApi(BASE_URL).checkHealth()

    expect(timeoutSpy).toHaveBeenCalledWith(30000)
  })

  it('timeoutMs を指定するとその値が使われる', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    await new VoicevoxApi(BASE_URL, { timeoutMs: 120000 }).checkHealth()

    expect(timeoutSpy).toHaveBeenCalledWith(120000)
  })

  it('VoicevoxClient の設定から VoicevoxApi へ伝播する', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    const client = new VoicevoxClient({
      url: BASE_URL,
      defaultSpeaker: 1,
      timeoutMs: 90000,
    })
    await client.checkHealth()

    expect(timeoutSpy).toHaveBeenCalledWith(90000)
  })
})
