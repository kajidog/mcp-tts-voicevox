import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig, resetConfigCache } from '../config'
import { expandGroups, TOOL_GROUPS } from '../tool-groups'
import { registerGetPlayerStateTool } from '../tools/player/get-player-state-tool'
import { registerResynthesizePlayerTool } from '../tools/player/resynthesize-player-tool'
import type { PlayerRuntime } from '../tools/player/runtime'
import { registerSpeakPlayerTool } from '../tools/player/speak-player-tool'
import { registerSpeakTool } from '../tools/speak'
import { registerSpeakerTools } from '../tools/speakers'
import type { ToolDeps } from '../tools/types'

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
      expect(tools).toContain('open_dictionary_ui')
    })

    it('dictionary グループを展開する', () => {
      const tools = expandGroups(['dictionary'])
      expect(tools).toEqual(TOOL_GROUPS.dictionary)
      expect(tools).toContain('get_accent_phrases')
      expect(tools).toContain('get_user_dictionary')
      expect(tools).toContain('add_user_dictionary_word')
      expect(tools).toContain('update_user_dictionary_word')
      expect(tools).toContain('delete_user_dictionary_word')
      expect(tools).toContain('add_user_dictionary_words')
      expect(tools).toContain('update_user_dictionary_words')
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
      expect(tools).toContain('open_dictionary_ui')
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

describe('disabled-tool guidance in descriptions and responses', () => {
  function createDeps(disabledTools: Iterable<string> = []) {
    const registerTool = vi.fn()
    const deps: ToolDeps = {
      server: { registerTool } as any,
      voicevoxClient: {} as any,
      config: {
        voicevoxUrl: 'http://localhost:50021',
        defaultSpeaker: 1,
        defaultSpeedScale: 1,
        defaultImmediate: true,
        defaultWaitForStart: false,
        defaultWaitForEnd: false,
        autoPlay: true,
      } as any,
      disabledTools: new Set(disabledTools),
      restrictions: { immediate: false, waitForStart: false, waitForEnd: false },
    }
    const getRegisteredCall = (name: string) => {
      const call = registerTool.mock.calls.find((c: any[]) => c[0] === name)
      expect(call).toBeDefined()
      return call!
    }
    return {
      deps,
      getToolConfig: (name: string) => getRegisteredCall(name)[1],
      getToolHandler: (name: string) => getRegisteredCall(name)[2],
    }
  }

  function createMockRuntime(overrides: Partial<PlayerRuntime> = {}): PlayerRuntime {
    return {
      playerVoicevoxApi: {} as any,
      getSpeakerList: vi.fn(async () => []),
      getSpeakerName: vi.fn(async (id: number) => `Speaker ${id}`),
      resolveSpeakerNames: vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, `Speaker ${id}`]))),
      getUserDictionaryWords: vi.fn(async () => []),
      synthesizeWithCache: vi.fn(),
      setSessionState: vi.fn(),
      getSessionState: vi.fn(() => undefined),
      getSessionStateByKey: vi.fn(() => undefined),
      ...overrides,
    }
  }

  describe('無効化なし（回帰確認）', () => {
    it('speak の description は voicevox_speak_player を案内する', () => {
      const { deps, getToolConfig } = createDeps()
      registerSpeakTool(deps)
      expect(getToolConfig('voicevox_speak').description).toContain('voicevox_speak_player')
    })

    it('get_player_state の description と viewUUID は speak_player/resynthesize_player を案内する', () => {
      const { deps, getToolConfig } = createDeps()
      registerGetPlayerStateTool(deps, createMockRuntime())
      const config = getToolConfig('voicevox_get_player_state')
      expect(config.description).toContain('speak_player/resynthesize_player')
      expect(config.inputSchema.viewUUID.description).toContain('speak_player/resynthesize_player')
    })

    it('speak_player の description は voicevox_speak を案内する', () => {
      const { deps, getToolConfig } = createDeps()
      registerSpeakPlayerTool(deps, createMockRuntime())
      expect(getToolConfig('voicevox_speak_player').description).toContain('voicevox_speak')
    })

    it('get_speakers の description は speak.speaker を案内する', () => {
      const { deps, getToolConfig } = createDeps()
      registerSpeakerTools(deps)
      expect(getToolConfig('voicevox_get_speakers').description).toContain('speak.speaker')
    })
  })

  describe('--disable-groups apps 相当（speak_player/resynthesize_player が無効）', () => {
    const appsDisabled = expandGroups(['apps'])

    it('speak の description に speak_player が現れない', () => {
      const { deps, getToolConfig } = createDeps(appsDisabled)
      registerSpeakTool(deps)
      expect(getToolConfig('voicevox_speak').description).not.toContain('speak_player')
    })

    it('get_player_state の description と viewUUID に無効ツール名が現れない', () => {
      const { deps, getToolConfig } = createDeps(appsDisabled)
      registerGetPlayerStateTool(deps, createMockRuntime())
      const config = getToolConfig('voicevox_get_player_state')
      expect(config.description).not.toContain('speak_player')
      expect(config.description).not.toContain('resynthesize_player')
      expect(config.inputSchema.viewUUID.description).not.toContain('speak_player')
      expect(config.inputSchema.viewUUID.description).not.toContain('resynthesize_player')
    })

    it('get_player_state のレスポンス hint が resynthesize_player 無効時に省略される', async () => {
      const state = { segments: [{ text: 'こんにちは', speaker: 1 }], updatedAt: 1 }
      const { deps, getToolHandler } = createDeps(appsDisabled)
      registerGetPlayerStateTool(deps, createMockRuntime({ getSessionState: vi.fn(() => state) }))
      const result = await getToolHandler('voicevox_get_player_state')({}, {})
      const payload = JSON.parse(result.content[0].text)
      expect(payload.hint).toBeUndefined()
    })

    it('get_player_state のレスポンス hint は有効時には含まれる', async () => {
      const state = { segments: [{ text: 'こんにちは', speaker: 1 }], updatedAt: 1 }
      const { deps, getToolHandler } = createDeps()
      registerGetPlayerStateTool(deps, createMockRuntime({ getSessionState: vi.fn(() => state) }))
      const result = await getToolHandler('voicevox_get_player_state')({}, {})
      const payload = JSON.parse(result.content[0].text)
      expect(payload.hint).toContain('resynthesize_player')
    })
  })

  describe('個別無効化', () => {
    it('speak 無効時、speak_player の description に voicevox_speak が現れない', () => {
      const { deps, getToolConfig } = createDeps(['speak'])
      registerSpeakPlayerTool(deps, createMockRuntime())
      const description = getToolConfig('voicevox_speak_player').description
      // 自ツール名 (voicevox_speak_player) は含まれてよいが、voicevox_speak 単体への案内は消える
      expect(description).not.toContain('use voicevox_speak instead')
    })

    it('speak 無効時、get_speakers の description に speak.speaker が現れない', () => {
      const { deps, getToolConfig } = createDeps(['speak'])
      registerSpeakerTools(deps)
      expect(getToolConfig('voicevox_get_speakers').description).not.toContain('speak.speaker')
    })

    it('speak_player の Next 行は無効ツールを列挙しない', async () => {
      const { deps, getToolHandler } = createDeps(['get_player_state'])
      registerSpeakPlayerTool(deps, createMockRuntime())
      const result = await getToolHandler('voicevox_speak_player')({ text: 'こんにちは' }, {})
      const text = result.content[0].text
      expect(text).toContain('voicevox_resynthesize_player')
      expect(text).not.toContain('voicevox_get_player_state')
    })

    it('speak_player の Next 行は後続ツールが全て無効なら省略される', async () => {
      const { deps, getToolHandler } = createDeps(['get_player_state', 'resynthesize_player'])
      registerSpeakPlayerTool(deps, createMockRuntime())
      const result = await getToolHandler('voicevox_speak_player')({ text: 'こんにちは' }, {})
      expect(result.content[0].text).not.toContain('Next:')
    })

    it('resynthesize_player のエラー文は speak_player 無効時に案内を含まない', async () => {
      const { deps, getToolHandler } = createDeps(['speak_player'])
      registerResynthesizePlayerTool(deps, createMockRuntime())
      const result = await getToolHandler('voicevox_resynthesize_player')({ viewUUID: 'x', trackIndex: 0 }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).not.toContain('speak_player')
    })

    it('resynthesize_player のエラー文は speak_player 有効時に案内を含む', async () => {
      const { deps, getToolHandler } = createDeps()
      registerResynthesizePlayerTool(deps, createMockRuntime())
      const result = await getToolHandler('voicevox_resynthesize_player')({ viewUUID: 'x', trackIndex: 0 }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Use speak_player first')
    })
  })
})
