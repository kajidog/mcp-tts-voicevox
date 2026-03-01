import {
  estimateAccentType,
  insertAccentBrackets,
  isKatakana,
  normalizeUserDictionaryWords,
  parseAccentNotation,
  splitToMoras,
} from '@kajidog/voicevox-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDictionaryTools } from '../dictionary.js'
import type { ToolDeps } from '../types.js'

const mockRegisterTool = vi.fn()

function createMockDeps(): ToolDeps {
  return {
    server: { registerTool: mockRegisterTool } as any,
    voicevoxClient: {} as any,
    config: {
      voicevoxUrl: 'http://localhost:50021',
      defaultSpeaker: 1,
      defaultSpeedScale: 1.0,
      defaultImmediate: true,
      defaultWaitForStart: false,
      defaultWaitForEnd: false,
      restrictImmediate: false,
      restrictWaitForStart: false,
      restrictWaitForEnd: false,
      disabledTools: [],
      httpMode: false,
      httpPort: 3000,
      httpHost: '0.0.0.0',
    } as any,
    disabledTools: new Set<string>(),
    restrictions: {
      immediate: false,
      waitForStart: false,
      waitForEnd: false,
    },
  }
}

function mockFetchResponse(data: any, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(data), { status }))
}

function mockFetchSequence(responses: Array<{ data: any; status?: number }>) {
  const spy = vi.spyOn(globalThis, 'fetch')
  for (const { data, status } of responses) {
    spy.mockResolvedValueOnce(new Response(JSON.stringify(data), { status: status ?? 200 }))
  }
  return spy
}

function getHandler(toolName: string) {
  const call = mockRegisterTool.mock.calls.find((c: any[]) => c[0] === toolName)
  expect(call).toBeDefined()
  return call![2]
}

// ─── Utility function tests ───

describe('splitToMoras', () => {
  it('基本的なカタカナをモーラに分割する', () => {
    expect(splitToMoras('コンニチワ')).toEqual(['コ', 'ン', 'ニ', 'チ', 'ワ'])
  })

  it('拗音を前の文字と結合する', () => {
    expect(splitToMoras('キョウト')).toEqual(['キョ', 'ウ', 'ト'])
  })

  it('長音符を独立モーラとして扱う', () => {
    expect(splitToMoras('サーバー')).toEqual(['サ', 'ー', 'バ', 'ー'])
  })

  it('小書きカタカナを前の文字と結合する', () => {
    expect(splitToMoras('ボイスボックス')).toEqual(['ボ', 'イ', 'ス', 'ボ', 'ッ', 'ク', 'ス'])
  })

  it('ティなどの外来音を結合する', () => {
    expect(splitToMoras('ティー')).toEqual(['ティ', 'ー'])
  })
})

describe('estimateAccentType', () => {
  it('モーラ数を返す', () => {
    expect(estimateAccentType('テスト')).toBe(3)
  })

  it('拗音を1モーラとして数える', () => {
    expect(estimateAccentType('キョウト')).toBe(3)
  })

  it('最低1を返す', () => {
    expect(estimateAccentType('')).toBe(1)
  })
})

describe('insertAccentBrackets', () => {
  it('指定位置にブラケットを挿入する', () => {
    expect(insertAccentBrackets('ボイスボックス', 6)).toBe('ボイスボッ[ク]ス')
  })

  it('accentType 0 ではブラケットなし', () => {
    expect(insertAccentBrackets('テスト', 0)).toBe('テスト')
  })

  it('先頭にブラケットを挿入する', () => {
    expect(insertAccentBrackets('テスト', 1)).toBe('[テ]スト')
  })

  it('範囲外のaccentTypeではそのまま返す', () => {
    expect(insertAccentBrackets('テスト', 10)).toBe('テスト')
  })
})

describe('parseAccentNotation', () => {
  it('ブラケット付き表記をパースする', () => {
    const result = parseAccentNotation('コン[ニ]チワ')
    expect(result.pronunciation).toBe('コンニチワ')
    expect(result.accentType).toBe(3)
  })

  it('ブラケットなしでは estimateAccentType を使う', () => {
    const result = parseAccentNotation('テスト')
    expect(result.pronunciation).toBe('テスト')
    expect(result.accentType).toBe(3)
  })

  it('拗音を含むブラケットをパースする', () => {
    const result = parseAccentNotation('[キョ]ウト')
    expect(result.pronunciation).toBe('キョウト')
    expect(result.accentType).toBe(1)
  })

  it('カンマを含むとエラーになる', () => {
    expect(() => parseAccentNotation('テスト,テスト')).toThrow('single phrase')
  })
})

describe('isKatakana', () => {
  it('カタカナのみの文字列で true を返す', () => {
    expect(isKatakana('ボイスボックス')).toBe(true)
  })

  it('ひらがなが含まれると false を返す', () => {
    expect(isKatakana('ぼいす')).toBe(false)
  })

  it('長音符は許可する', () => {
    expect(isKatakana('サーバー')).toBe(true)
  })
})

describe('normalizeUserDictionaryWords', () => {
  it('accentType をインライン表記に変換する', () => {
    const result = normalizeUserDictionaryWords({
      'uuid-1': { surface: 'テスト', pronunciation: 'テスト', accent_type: 1, priority: 5 },
    })
    expect(result).toHaveLength(1)
    expect(result[0].wordUuid).toBe('uuid-1')
    expect(result[0].pronunciation).toBe('[テ]スト')
    expect(result[0]).not.toHaveProperty('accentType')
  })

  it('平板型 (accent_type=0) ではブラケットなし', () => {
    const result = normalizeUserDictionaryWords({
      'uuid-1': { surface: 'テスト', pronunciation: 'テスト', accent_type: 0, priority: 5 },
    })
    expect(result[0].pronunciation).toBe('テスト')
  })
})

// ─── Tool handler tests ───

describe('registerDictionaryTools', () => {
  let deps: ToolDeps

  beforeEach(() => {
    vi.clearAllMocks()
    deps = createMockDeps()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('7つのツールを登録する', () => {
    registerDictionaryTools(deps)
    expect(mockRegisterTool).toHaveBeenCalledTimes(7)
    const toolNames = mockRegisterTool.mock.calls.map((c: any[]) => c[0])
    expect(toolNames).toContain('voicevox_get_accent_phrases')
    expect(toolNames).toContain('voicevox_get_user_dictionary')
    expect(toolNames).toContain('voicevox_add_user_dictionary_word')
    expect(toolNames).toContain('voicevox_update_user_dictionary_word')
    expect(toolNames).toContain('voicevox_delete_user_dictionary_word')
    expect(toolNames).toContain('voicevox_add_user_dictionary_words')
    expect(toolNames).toContain('voicevox_update_user_dictionary_words')
  })

  describe('get_accent_phrases handler', () => {
    it('テキストのアクセント句とインライン表記を返す', async () => {
      const mockPhrases = [
        {
          moras: [
            { text: 'コ', vowel: 'o', vowel_length: 0.1, pitch: 5.0 },
            { text: 'ン', vowel: 'N', vowel_length: 0.1, pitch: 5.0 },
            { text: 'ニ', vowel: 'i', vowel_length: 0.1, pitch: 5.5 },
            { text: 'チ', vowel: 'i', vowel_length: 0.1, pitch: 5.0 },
            { text: 'ワ', vowel: 'a', vowel_length: 0.1, pitch: 4.5 },
          ],
          accent: 3,
        },
      ]
      mockFetchResponse(mockPhrases)

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_get_accent_phrases')

      const result = await handler({ text: 'こんにちは' }, {})
      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.notation).toBe('コン[ニ]チワ')
      expect(parsed.accentPhrases).toEqual(mockPhrases)
    })

    it('空テキストでエラーを返す', async () => {
      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_get_accent_phrases')

      const result = await handler({ text: '  ' }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('text is required')
    })
  })

  describe('get_user_dictionary handler', () => {
    const mockDict = {
      'uuid-1': { surface: 'テスト', pronunciation: 'テスト', accent_type: 1, priority: 5 },
      'uuid-2': { surface: 'VOICEVOX', pronunciation: 'ボイスボックス', accent_type: 4, priority: 7 },
      'uuid-3': { surface: 'サンプル', pronunciation: 'サンプル', accent_type: 1, priority: 3 },
    }

    it('辞書一覧をインライン表記で返す', async () => {
      mockFetchResponse(mockDict)

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_get_user_dictionary')

      const result = await handler({}, {})
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.totalCount).toBe(3)
      expect(parsed.offset).toBe(0)
      expect(parsed.limit).toBe(50)
      expect(parsed.words).toHaveLength(3)
      expect(parsed.words[0].pronunciation).toBe('[テ]スト')
      expect(parsed.words).not.toHaveProperty('accentType')
    })

    it('queryでフィルタリングできる', async () => {
      mockFetchResponse(mockDict)

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_get_user_dictionary')

      const result = await handler({ query: 'voicevox' }, {})
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.totalCount).toBe(1)
      expect(parsed.words[0].surface).toBe('VOICEVOX')
    })

    it('offset/limit でページングできる', async () => {
      mockFetchResponse(mockDict)

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_get_user_dictionary')

      const result = await handler({ offset: 1, limit: 1 }, {})
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.totalCount).toBe(3)
      expect(parsed.words).toHaveLength(1)
      expect(parsed.offset).toBe(1)
      expect(parsed.limit).toBe(1)
    })
  })

  describe('add_user_dictionary_word handler', () => {
    it('辞書に単語を追加して追加した単語のみ返す', async () => {
      const fetchSpy = mockFetchSequence([
        { data: 'uuid-new' },
        {
          data: {
            'uuid-new': { surface: 'VOICEVOX', pronunciation: 'ボイスボックス', accent_type: 6, priority: 5 },
          },
        },
      ])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_add_user_dictionary_word')

      const result = await handler({ surface: 'VOICEVOX', pronunciation: 'ボイスボックス' }, {})
      expect(result.isError).toBeUndefined()

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.word).toBeDefined()
      expect(parsed.word.wordUuid).toBe('uuid-new')
      expect(parsed.word.surface).toBe('VOICEVOX')
      expect(parsed.word.pronunciation).toBe('ボイスボッ[ク]ス')
      expect(parsed.words).toBeUndefined()

      const [addUrl, addInit] = fetchSpy.mock.calls[0]
      expect(String(addUrl)).toContain('/user_dict_word')
      expect((addInit as RequestInit).method).toBe('POST')
    })

    it('インライン表記でアクセントを指定できる', async () => {
      const fetchSpy = mockFetchSequence([
        { data: 'uuid-new' },
        { data: { 'uuid-new': { surface: 'テスト', pronunciation: 'テスト', accent_type: 2, priority: 5 } } },
      ])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_add_user_dictionary_word')

      await handler({ surface: 'テスト', pronunciation: 'テ[ス]ト' }, {})
      const [addUrl] = fetchSpy.mock.calls[0]
      expect(String(addUrl)).toContain('accent_type=2')
    })

    it('カタカナでない読みでエラーを返す', async () => {
      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_add_user_dictionary_word')

      const result = await handler({ surface: 'test', pronunciation: 'abc' }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Katakana')
    })
  })

  describe('update_user_dictionary_word handler', () => {
    it('辞書の単語を更新して更新した単語のみ返す', async () => {
      const fetchSpy = mockFetchSequence([
        {
          data: {
            'uuid-1': { surface: 'old', pronunciation: 'フルイ', accent_type: 1, priority: 5 },
          },
        },
        { data: '' },
      ])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_update_user_dictionary_word')

      const result = await handler(
        {
          wordUuid: 'uuid-1',
          surface: 'updated',
          pronunciation: 'アッ[プ]デート',
        },
        {}
      )
      expect(result.isError).toBeUndefined()

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.word).toBeDefined()
      expect(parsed.word.wordUuid).toBe('uuid-1')
      expect(parsed.word.surface).toBe('updated')
      expect(parsed.word.pronunciation).toBe('アッ[プ]デート')
      expect(parsed.words).toBeUndefined()

      const [, updateInit] = fetchSpy.mock.calls[1]
      expect((updateInit as RequestInit).method).toBe('PUT')
    })

    it('surface/pronunciation 省略時は既存値を維持する', async () => {
      const fetchSpy = mockFetchSequence([
        {
          data: {
            'uuid-1': { surface: 'existing', pronunciation: 'キゾン', accent_type: 2, priority: 5 },
          },
        },
        { data: '' },
      ])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_update_user_dictionary_word')

      const result = await handler({ wordUuid: 'uuid-1', priority: 8 }, {})
      expect(result.isError).toBeUndefined()

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.word.surface).toBe('existing')
      expect(parsed.word.pronunciation).toBe('キ[ゾ]ン')
      expect(parsed.word.priority).toBe(8)

      const [updateUrl] = fetchSpy.mock.calls[1]
      expect(String(updateUrl)).toContain('surface=existing')
      expect(String(updateUrl)).toContain('accent_type=2')
    })

    it('存在しないUUIDでエラーを返す', async () => {
      mockFetchResponse({})

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_update_user_dictionary_word')

      const result = await handler({ wordUuid: 'nonexistent', surface: 'x', pronunciation: 'テスト' }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not found')
    })
  })

  describe('delete_user_dictionary_word handler', () => {
    it('辞書から単語を削除して軽量レスポンスを返す', async () => {
      const fetchSpy = mockFetchSequence([{ data: '' }])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_delete_user_dictionary_word')

      const result = await handler({ wordUuid: 'uuid-del' }, {})
      expect(result.isError).toBeUndefined()

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(true)
      expect(parsed.deletedWordUuid).toBe('uuid-del')
      expect(parsed.words).toBeUndefined()

      const [deleteUrl, deleteInit] = fetchSpy.mock.calls[0]
      expect(String(deleteUrl)).toContain('/user_dict_word/uuid-del')
      expect((deleteInit as RequestInit).method).toBe('DELETE')
    })

    it('空のUUIDでエラーを返す', async () => {
      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_delete_user_dictionary_word')

      const result = await handler({ wordUuid: '  ' }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('wordUuid is required')
    })
  })

  describe('add_user_dictionary_words handler (bulk)', () => {
    it('複数単語を一括追加する', async () => {
      mockFetchSequence([
        { data: 'uuid-1' },
        { data: 'uuid-2' },
        {
          data: {
            'uuid-1': { surface: 'テスト', pronunciation: 'テスト', accent_type: 3, priority: 5 },
            'uuid-2': { surface: 'サンプル', pronunciation: 'サンプル', accent_type: 1, priority: 7 },
          },
        },
      ])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_add_user_dictionary_words')

      const result = await handler(
        {
          words: [
            { surface: 'テスト', pronunciation: 'テスト' },
            { surface: 'サンプル', pronunciation: '[サ]ンプル', priority: 7 },
          ],
        },
        {}
      )
      expect(result.isError).toBeUndefined()

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.addedCount).toBe(2)
      expect(parsed.words).toHaveLength(2)
    })
  })

  describe('update_user_dictionary_words handler (bulk)', () => {
    it('複数単語を一括更新する', async () => {
      mockFetchSequence([
        {
          data: {
            'uuid-1': { surface: 'old1', pronunciation: 'フルイイチ', accent_type: 1, priority: 5 },
            'uuid-2': { surface: 'old2', pronunciation: 'フルイニ', accent_type: 1, priority: 5 },
          },
        },
        { data: '' },
        { data: '' },
      ])

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_update_user_dictionary_words')

      const result = await handler(
        {
          words: [
            { wordUuid: 'uuid-1', surface: 'new1' },
            { wordUuid: 'uuid-2', pronunciation: 'アタラシイ' },
          ],
        },
        {}
      )
      expect(result.isError).toBeUndefined()

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.updatedCount).toBe(2)
      expect(parsed.words).toHaveLength(2)
      expect(parsed.words[0].surface).toBe('new1')
      expect(parsed.words[0].pronunciation).toBe('[フ]ルイイチ')
      expect(parsed.words[1].surface).toBe('old2')
    })

    it('存在しないUUIDでエラーを返す', async () => {
      mockFetchResponse({})

      registerDictionaryTools(deps)
      const handler = getHandler('voicevox_update_user_dictionary_words')

      const result = await handler({ words: [{ wordUuid: 'nonexistent' }] }, {})
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not found')
    })
  })
})
