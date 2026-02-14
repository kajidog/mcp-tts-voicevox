import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig, resetConfigCache } from '../config'

describe('tool disabling', () => {
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

  describe('getConfig with disabled tools', () => {
    it('VOICEVOX_DISABLED_TOOLS で複数ツールを無効化できる', () => {
      process.env.VOICEVOX_DISABLED_TOOLS = 'speak,get_speaker_detail'

      const config = getConfig([], process.env)

      expect(config.disabledTools).toEqual(['speak', 'get_speaker_detail'])
    })

    it('VOICEVOX_DISABLED_TOOLS が空の場合は空配列を返す', () => {
      process.env.VOICEVOX_DISABLED_TOOLS = undefined

      const config = getConfig([], process.env)

      expect(config.disabledTools).toEqual([])
    })

    it('CLI引数 --disable-tools が環境変数を上書きする', () => {
      process.env.VOICEVOX_DISABLED_TOOLS = 'speak'

      const config = getConfig(['--disable-tools', 'get_speaker_detail,stop_speaker'], process.env)

      expect(config.disabledTools).toEqual(['get_speaker_detail', 'stop_speaker'])
    })

    it('無効化ツール名のスペースをトリムする', () => {
      process.env.VOICEVOX_DISABLED_TOOLS = 'speak , get_speaker_detail , stop_speaker'

      const config = getConfig([], process.env)

      expect(config.disabledTools).toEqual(['speak', 'get_speaker_detail', 'stop_speaker'])
    })
  })

  describe('valid tool names for disabling', () => {
    const validToolNames = [
      'speak',
      'ping',
      'synthesize_file',
      'stop_speaker',
      'get_speakers',
      'get_speaker_detail',
    ]

    it.each(validToolNames)('ツール名 "%s" を無効化できる', (toolName) => {
      const config = getConfig(['--disable-tools', toolName], {})

      expect(config.disabledTools).toContain(toolName)
    })

    it('全ツールを無効化できる', () => {
      const allTools = validToolNames.join(',')
      const config = getConfig(['--disable-tools', allTools], {})

      expect(config.disabledTools).toHaveLength(validToolNames.length)
      for (const toolName of validToolNames) {
        expect(config.disabledTools).toContain(toolName)
      }
    })
  })
})
