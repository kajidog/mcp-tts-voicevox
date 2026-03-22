import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig, resetConfigCache } from '../config'
import { TOOL_GROUPS, expandGroups } from '../tool-groups'

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
    const validToolNames = ['speak', 'ping', 'synthesize_file', 'stop_speaker', 'get_speakers', 'get_speaker_detail']

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

describe('tool groups (--disable-groups)', () => {
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

  describe('expandGroups', () => {
    it('player グループを展開する', () => {
      const tools = expandGroups(['player'])
      expect(tools).toEqual(TOOL_GROUPS.player)
      expect(tools).toContain('speak_player')
      expect(tools).toContain('resynthesize_player')
      expect(tools).toContain('get_player_state')
    })

    it('dictionary グループを展開する', () => {
      const tools = expandGroups(['dictionary'])
      expect(tools).toEqual(TOOL_GROUPS.dictionary)
      expect(tools).toContain('get_accent_phrases')
      expect(tools).toContain('get_user_dictionary')
    })

    it('file グループを展開する', () => {
      const tools = expandGroups(['file'])
      expect(tools).toEqual(TOOL_GROUPS.file)
      expect(tools).toContain('synthesize_file')
    })

    it('apps グループを展開する', () => {
      const tools = expandGroups(['apps'])
      expect(tools).toEqual(TOOL_GROUPS.apps)
      expect(tools).toContain('speak_player')
      expect(tools).toContain('resynthesize_player')
    })

    it('複数グループを展開する', () => {
      const tools = expandGroups(['player', 'dictionary'])
      expect(tools).toContain('speak_player')
      expect(tools).toContain('get_accent_phrases')
    })

    it('空配列を渡すと空配列を返す', () => {
      const tools = expandGroups([])
      expect(tools).toEqual([])
    })

    it('不明なグループ名はスキップしてエラーを出す', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const tools = expandGroups(['nonexistent'])
      expect(tools).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'))
      consoleSpy.mockRestore()
    })
  })

  describe('getConfig with disabled groups', () => {
    it('VOICEVOX_DISABLED_GROUPS で player グループを無効化できる', () => {
      process.env.VOICEVOX_DISABLED_GROUPS = 'player'

      const config = getConfig([], process.env)

      expect(config.disabledGroups).toEqual(['player'])
    })

    it('CLI引数 --disable-groups が環境変数を上書きする', () => {
      process.env.VOICEVOX_DISABLED_GROUPS = 'dictionary'

      const config = getConfig(['--disable-groups', 'player'], process.env)

      expect(config.disabledGroups).toEqual(['player'])
    })

    it('--disable-groups で複数グループを指定できる', () => {
      const config = getConfig(['--disable-groups', 'player,dictionary'], {})

      expect(config.disabledGroups).toEqual(['player', 'dictionary'])
    })

    it('デフォルトは空配列', () => {
      const config = getConfig([], {})

      expect(config.disabledGroups).toEqual([])
    })
  })
})
