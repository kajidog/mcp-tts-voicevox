import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseServerConfig } from '../config.js'
import { createHttpApp } from '../http.js'

/**
 * http.ts のセキュリティ境界（Origin / Host / APIキー検証）のテスト。
 *
 * createHttpApp は Hono アプリを返すので、実際にサーバーを listen せず
 * app.request() で直接ミドルウェアを通せる。
 */

const baseConfig: BaseServerConfig = {
  httpMode: true,
  httpPort: 3000,
  httpHost: '0.0.0.0',
  allowedHosts: ['localhost', '127.0.0.1', '[::1]'],
  allowedOrigins: ['http://localhost', 'http://127.0.0.1', 'https://localhost', 'https://127.0.0.1'],
}

function makeApp(overrides: Partial<BaseServerConfig> = {}) {
  return createHttpApp({
    config: { ...baseConfig, ...overrides },
    serverFactory: () => new McpServer({ name: 'test-server', version: '0.0.0' }),
  })
}

/** ミドルウェアを通過したことだけを確かめたいので、本文は不正JSONにして 400 を期待する */
const INVALID_JSON_BODY = 'not json'

function post(headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: INVALID_JSON_BODY,
  }
}

beforeEach(() => {
  // ミドルウェアが拒否のたびに console.log するのでテスト出力を抑制する
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('createHttpApp', () => {
  it('serverFactory が関数でない場合は生成時に throw する', () => {
    expect(() =>
      createHttpApp({
        config: baseConfig,
        serverFactory: undefined as unknown as () => McpServer,
      })
    ).toThrow(/serverFactory/)
  })

  it('/health は常に ok を返す', async () => {
    const res = await makeApp().request('/health')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'ok', mode: 'stateless' })
  })

  it('ステートレスモードでは POST 以外を 405 で拒否する', async () => {
    const res = await makeApp().request('/mcp', { method: 'GET' })
    expect(res.status).toBe(405)
  })
})

describe('Origin 検証', () => {
  it('Origin ヘッダーが無い場合は通過させる', async () => {
    const res = await makeApp().request('/mcp', post())
    // ミドルウェアを抜けて本体に到達 → 不正JSONで 400
    expect(res.status).toBe(400)
  })

  it('許可された Origin を通過させる', async () => {
    const res = await makeApp().request('/mcp', post({ Origin: 'http://localhost' }))
    expect(res.status).toBe(400)
  })

  it('ポート番号が違っても許可された Origin なら通過させる', async () => {
    const res = await makeApp().request('/mcp', post({ Origin: 'http://localhost:5173' }))
    expect(res.status).toBe(400)
  })

  it('許可されていない Origin を 403 で拒否する', async () => {
    const res = await makeApp().request('/mcp', post({ Origin: 'http://evil.example.com' }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'Forbidden: Invalid Origin header' },
    })
  })

  it('ホスト名が部分一致するだけの Origin を拒否する', async () => {
    const res = await makeApp().request('/mcp', post({ Origin: 'http://localhost.evil.com' }))
    expect(res.status).toBe(403)
  })

  it('プロトコルが異なる Origin を拒否する', async () => {
    const res = await makeApp().request('/mcp', post({ Origin: 'ftp://localhost' }))
    expect(res.status).toBe(403)
  })

  it('URL として解釈できない Origin を 403 で拒否する', async () => {
    const res = await makeApp().request('/mcp', post({ Origin: 'not-a-url' }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'Forbidden: Malformed Origin header' },
    })
  })
})

describe('Host 検証', () => {
  it('許可された Host を通過させる', async () => {
    const res = await makeApp().request('/mcp', post({ Host: 'localhost' }))
    expect(res.status).toBe(400)
  })

  it('ポート付きの Host はホスト名部分で判定する', async () => {
    const res = await makeApp().request('/mcp', post({ Host: 'localhost:3000' }))
    expect(res.status).toBe(400)
  })

  it('許可されていない Host を 403 で拒否する', async () => {
    const res = await makeApp().request('/mcp', post({ Host: 'evil.example.com' }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'Forbidden: Invalid Host header' },
    })
  })

  it('allowedHosts を設定で拡張できる', async () => {
    const app = makeApp({ allowedHosts: ['tts.internal'] })
    await expect(app.request('/mcp', post({ Host: 'tts.internal' })).then((r) => r.status)).resolves.toBe(400)
    await expect(app.request('/mcp', post({ Host: 'localhost' })).then((r) => r.status)).resolves.toBe(403)
  })
})

describe('APIキー検証', () => {
  const apiKey = 'super-secret-key'

  it('apiKey 未設定なら検証をバイパスする', async () => {
    const res = await makeApp().request('/mcp', post({ 'X-API-Key': 'anything' }))
    expect(res.status).toBe(400)
  })

  it('X-API-Key ヘッダーで認証できる', async () => {
    const res = await makeApp({ apiKey }).request('/mcp', post({ 'X-API-Key': apiKey }))
    expect(res.status).toBe(400)
  })

  it('Authorization: Bearer で認証できる', async () => {
    const res = await makeApp({ apiKey }).request('/mcp', post({ Authorization: `Bearer ${apiKey}` }))
    expect(res.status).toBe(400)
  })

  it('キーが無い場合は 401 で拒否する', async () => {
    const res = await makeApp({ apiKey }).request('/mcp', post())
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'Unauthorized: Invalid API key' },
    })
  })

  it.each([
    ['1文字違い', 'super-secret-keY'],
    ['短い', 'super-secret-ke'],
    ['長い', 'super-secret-key-extra'],
    ['空文字', ''],
    ['前方一致のみ', 'super'],
  ])('不一致のキー（%s）を 401 で拒否する', async (_label, provided) => {
    const res = await makeApp({ apiKey }).request('/mcp', post({ 'X-API-Key': provided }))
    expect(res.status).toBe(401)
  })

  it('Bearer プレフィックスが無い Authorization は認証に使わない', async () => {
    const res = await makeApp({ apiKey }).request('/mcp', post({ Authorization: apiKey }))
    expect(res.status).toBe(401)
  })

  it('X-API-Key が Bearer トークンより優先される', async () => {
    const res = await makeApp({ apiKey }).request(
      '/mcp',
      post({ 'X-API-Key': 'wrong', Authorization: `Bearer ${apiKey}` })
    )
    expect(res.status).toBe(401)
  })

  it('OPTIONS（プリフライト）は認証をバイパスする', async () => {
    const res = await makeApp({ apiKey }).request('/mcp', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost',
        'Access-Control-Request-Method': 'POST',
      },
    })
    expect(res.status).not.toBe(401)
  })
})
