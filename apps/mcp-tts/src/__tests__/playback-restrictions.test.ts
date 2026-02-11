import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig, resetConfigCache } from '../config'

describe('playback restrictions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    resetConfigCache()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    resetConfigCache()
  })

  describe('restriction settings from environment variables', () => {
    it('VOICEVOX_RESTRICT_IMMEDIATE=true で immediate を制限できる', () => {
      process.env.VOICEVOX_RESTRICT_IMMEDIATE = 'true'

      const config = getConfig([], process.env)

      expect(config.restrictImmediate).toBe(true)
    })

    it('VOICEVOX_RESTRICT_WAIT_FOR_START=true で waitForStart を制限できる', () => {
      process.env.VOICEVOX_RESTRICT_WAIT_FOR_START = 'true'

      const config = getConfig([], process.env)

      expect(config.restrictWaitForStart).toBe(true)
    })

    it('VOICEVOX_RESTRICT_WAIT_FOR_END=true で waitForEnd を制限できる', () => {
      process.env.VOICEVOX_RESTRICT_WAIT_FOR_END = 'true'

      const config = getConfig([], process.env)

      expect(config.restrictWaitForEnd).toBe(true)
    })

    it('制限設定が未設定の場合は false', () => {
      process.env.VOICEVOX_RESTRICT_IMMEDIATE = undefined
      process.env.VOICEVOX_RESTRICT_WAIT_FOR_START = undefined
      process.env.VOICEVOX_RESTRICT_WAIT_FOR_END = undefined

      const config = getConfig([], process.env)

      expect(config.restrictImmediate).toBe(false)
      expect(config.restrictWaitForStart).toBe(false)
      expect(config.restrictWaitForEnd).toBe(false)
    })
  })

  describe('restriction settings from CLI arguments', () => {
    it('--restrict-immediate で immediate を制限できる', () => {
      const config = getConfig(['--restrict-immediate'], {})

      expect(config.restrictImmediate).toBe(true)
    })

    it('--restrict-wait-for-start で waitForStart を制限できる', () => {
      const config = getConfig(['--restrict-wait-for-start'], {})

      expect(config.restrictWaitForStart).toBe(true)
    })

    it('--restrict-wait-for-end で waitForEnd を制限できる', () => {
      const config = getConfig(['--restrict-wait-for-end'], {})

      expect(config.restrictWaitForEnd).toBe(true)
    })

    it('全ての制限を同時に設定できる', () => {
      const config = getConfig(['--restrict-immediate', '--restrict-wait-for-start', '--restrict-wait-for-end'], {})

      expect(config.restrictImmediate).toBe(true)
      expect(config.restrictWaitForStart).toBe(true)
      expect(config.restrictWaitForEnd).toBe(true)
    })
  })

  describe('CLI arguments override environment variables for restrictions', () => {
    it('CLI引数が環境変数を上書きする', () => {
      // 環境変数では immediate のみ制限
      process.env.VOICEVOX_RESTRICT_IMMEDIATE = 'true'
      process.env.VOICEVOX_RESTRICT_WAIT_FOR_START = undefined

      // CLI引数で waitForStart も追加
      const config = getConfig(['--restrict-wait-for-start'], process.env)

      expect(config.restrictImmediate).toBe(true) // 環境変数から
      expect(config.restrictWaitForStart).toBe(true) // CLI引数から
    })
  })

  describe('default playback options with restrictions', () => {
    it('制限が有効でもデフォルト値は正しく設定される', () => {
      process.env.VOICEVOX_RESTRICT_IMMEDIATE = 'true'
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = 'false' // デフォルト値

      const config = getConfig([], process.env)

      // 制限は有効
      expect(config.restrictImmediate).toBe(true)
      // デフォルト値も設定される（制限とは独立）
      expect(config.defaultImmediate).toBe(false)
    })

    it('制限とデフォルト値は独立して設定できる', () => {
      const config = getConfig(['--restrict-immediate', '--no-immediate'], {})

      // 制限は有効
      expect(config.restrictImmediate).toBe(true)
      // デフォルト値は false
      expect(config.defaultImmediate).toBe(false)
    })
  })
})
