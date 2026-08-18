/**
 * HTTP ステートレスモードでは createServer() がリクエストごとに呼ばれる。
 * そのたびに VoicevoxClient を作ってしまうと、speak を実行したキューと
 * stop_speaker が触るキューが別インスタンスになり再生を止められないため、
 * client がプロセス内で共有されることを検証する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const clearQueue = vi.fn()
const constructorCalls: unknown[] = []

vi.mock('@kajidog/voicevox-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kajidog/voicevox-client')>()
  return {
    ...actual,
    VoicevoxClient: class {
      constructor(options: unknown) {
        constructorCalls.push(options)
      }
      clearQueue = clearQueue
      getSpeakers = vi.fn().mockResolvedValue([])
      checkHealth = vi.fn().mockResolvedValue({ connected: true, url: '', version: '0' })
    },
  }
})

// McpServer の内部レジストリから登録済みツールのハンドラを取り出す
function getRegisteredHandler(server: any, toolName: string) {
  const registered = server._registeredTools?.[toolName]
  expect(registered, `tool ${toolName} should be registered`).toBeDefined()
  return registered.handler
}

describe('VoicevoxClient の共有', () => {
  beforeEach(() => {
    clearQueue.mockClear()
  })

  it('createServer() を複数回呼んでも VoicevoxClient は 1 つだけ生成される', async () => {
    const { createServer } = await import('../server.js')
    const before = constructorCalls.length

    createServer()
    createServer()

    // モジュール読み込み時の default server 生成も含め、生成は最初の 1 回だけ
    expect(constructorCalls.length).toBe(before)
    expect(constructorCalls.length).toBeGreaterThan(0)
  })

  it('リクエストごとに作った McpServer の stop_speaker が同じ client に届く', async () => {
    const { createServer, getVoicevoxClient } = await import('../server.js')

    // HTTP ステートレス: speak 用と stop_speaker 用で別々の McpServer が作られる
    const serverForSpeak = createServer()
    const serverForStop = createServer()
    expect(serverForSpeak).not.toBe(serverForStop)

    const stopHandler = getRegisteredHandler(serverForStop, 'voicevox_stop_speaker')
    await stopHandler({}, {} as any)

    // 共有 client の clearQueue が呼ばれている＝再生中のキューを止められる
    expect(clearQueue).toHaveBeenCalledTimes(1)
    expect(getVoicevoxClient()).toBeDefined()
  })

  it('テスト用に client を注入できる', async () => {
    const { createServer } = await import('../server.js')
    const injectedClearQueue = vi.fn()
    const injected = { clearQueue: injectedClearQueue } as any

    const server = createServer(injected)
    const stopHandler = getRegisteredHandler(server, 'voicevox_stop_speaker')
    await stopHandler({}, {} as any)

    expect(injectedClearQueue).toHaveBeenCalledTimes(1)
    expect(clearQueue).not.toHaveBeenCalled()
  })
})
