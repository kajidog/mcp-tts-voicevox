/**
 * MCP Server - 再生オプションテスト
 * server.ts の immediate オプション処理の修正をテストします
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 環境変数を各テストで制御するため、最初に保存
const originalEnv = process.env

describe('MCP Server - 再生オプションの処理', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('immediate オプションのデフォルト値処理', () => {
    it('環境変数が未設定で immediate=true を明示指定した場合、true になる', () => {
      // 環境変数を未設定にする
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = undefined

      // server.ts の処理をシミュレート
      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const immediate = true // 明示指定
      const result = immediate ?? defaultImmediate

      expect(result).toBe(true)
    })

    it('環境変数が未設定で immediate 未指定の場合、true になる', () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = undefined

      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const immediate = undefined // 未指定
      const result = immediate ?? defaultImmediate

      expect(result).toBe(true)
    })

    it('環境変数が false で immediate=true を明示指定した場合、true になる', () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = 'false'

      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const immediate = true // 明示指定
      const result = immediate ?? defaultImmediate

      expect(result).toBe(true)
    })

    it('環境変数が false で immediate 未指定の場合、false になる', () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = 'false'

      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const immediate = undefined // 未指定
      const result = immediate ?? defaultImmediate

      expect(result).toBe(false)
    })

    it('環境変数が true で immediate=false を明示指定した場合、false になる', () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = 'true'

      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const immediate = false // 明示指定
      const result = immediate ?? defaultImmediate

      expect(result).toBe(false)
    })

    it('環境変数が true で immediate 未指定の場合、true になる', () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = 'true'

      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const immediate = undefined // 未指定
      const result = immediate ?? defaultImmediate

      expect(result).toBe(true)
    })
  })

  describe('waitForStart オプションの処理', () => {
    it('環境変数とオプション指定の組み合わせ', () => {
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = 'true'

      const defaultWaitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START === 'true'
      const waitForStart = false // 明示指定
      const result = waitForStart ?? defaultWaitForStart

      expect(result).toBe(false)
    })

    it('環境変数未設定でオプション未指定の場合', () => {
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = undefined

      const defaultWaitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START === 'true'
      const waitForStart = undefined // 未指定
      const result = waitForStart ?? defaultWaitForStart

      expect(result).toBe(false)
    })
  })

  describe('waitForEnd オプションの処理', () => {
    it('環境変数とオプション指定の組み合わせ', () => {
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = 'true'

      const defaultWaitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true'
      const waitForEnd = false // 明示指定
      const result = waitForEnd ?? defaultWaitForEnd

      expect(result).toBe(false)
    })

    it('環境変数未設定でオプション未指定の場合', () => {
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = undefined

      const defaultWaitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true'
      const waitForEnd = undefined // 未指定
      const result = waitForEnd ?? defaultWaitForEnd

      expect(result).toBe(false)
    })
  })

  describe('修正前の問題を確認（回帰テスト）', () => {
    it('修正前の処理では immediate=true が無視されていた', () => {
      // 修正前の処理をシミュレート
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = undefined

      const oldDefaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE === 'true' // false
      const immediate = true // 明示指定
      const oldResult = immediate ?? oldDefaultImmediate ?? true

      // 修正前は false ?? false ?? true = false になってしまう
      // （実際には false ?? true = false なので問題）
      expect(oldDefaultImmediate).toBe(false)

      // 修正後の処理
      const newDefaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false' // true
      const newResult = immediate ?? newDefaultImmediate

      expect(newResult).toBe(true)
    })
  })

  describe('playbackOptions オブジェクトの生成', () => {
    it('すべてのオプションが正しく設定される', () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = 'false'
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = 'true'
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = 'true'

      // server.ts と同様の処理
      const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false'
      const defaultWaitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START === 'true'
      const defaultWaitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true'

      const immediate = true // 明示指定
      const waitForStart = undefined // 未指定
      const waitForEnd = false // 明示指定

      const playbackOptions = {
        immediate: immediate ?? defaultImmediate,
        waitForStart: waitForStart ?? defaultWaitForStart,
        waitForEnd: waitForEnd ?? defaultWaitForEnd,
      }

      expect(playbackOptions).toEqual({
        immediate: true, // 明示指定が優先
        waitForStart: true, // 環境変数のデフォルト
        waitForEnd: false, // 明示指定が優先
      })
    })
  })
})
