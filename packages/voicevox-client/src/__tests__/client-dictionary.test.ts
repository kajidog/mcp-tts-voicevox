import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxClient } from '../client'

const BASE_URL = 'http://localhost:50021'

function createClient(): VoicevoxClient {
  return new VoicevoxClient({ url: BASE_URL, defaultSpeaker: 1 })
}

const mockDictionary = {
  'uuid-1': { surface: 'テスト', pronunciation: 'テスト', accent_type: 1, word_type: 'PROPER_NOUN', priority: 5 },
  'uuid-2': {
    surface: 'VOICEVOX',
    pronunciation: 'ボイスボックス',
    accent_type: 4,
    word_type: 'PROPER_NOUN',
    priority: 7,
  },
}

function mockFetchSequence(...responses: Array<{ body: any; status?: number }>) {
  const spy = vi.spyOn(globalThis, 'fetch')
  for (const res of responses) {
    spy.mockResolvedValueOnce(
      new Response(typeof res.body === 'string' ? res.body : JSON.stringify(res.body), {
        status: res.status ?? 200,
      })
    )
  }
  return spy
}

describe('VoicevoxClient - dictionary methods', () => {
  let client: VoicevoxClient

  beforeEach(() => {
    vi.resetAllMocks()
    client = createClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDictionary', () => {
    it('notation 付きで辞書を返す', async () => {
      mockFetchSequence({ body: mockDictionary })

      const result = await client.getDictionary()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        wordUuid: 'uuid-1',
        surface: 'テスト',
        pronunciation: 'テスト',
        accentType: 1,
        notation: '[テ]スト',
        priority: 5,
      })
      expect(result[1]).toEqual({
        wordUuid: 'uuid-2',
        surface: 'VOICEVOX',
        pronunciation: 'ボイスボックス',
        accentType: 4,
        notation: 'ボイス[ボ]ックス',
        priority: 7,
      })
    })
  })

  describe('addDictionaryWord', () => {
    it('notation 入力で追加', async () => {
      // add API + getDictionary refetch
      mockFetchSequence({ body: 'uuid-new', status: 200 }, { body: mockDictionary })

      const result = await client.addDictionaryWord({
        surface: 'テスト',
        pronunciation: 'テ[ス]ト',
      })

      const addCall = vi.mocked(fetch).mock.calls[0]
      expect(String(addCall[0])).toContain('/user_dict_word')
      expect(String(addCall[0])).toContain('accent_type=2')
      expect(result).toHaveLength(2)
    })

    it('plain 入力で追加（accentType 自動推定）', async () => {
      mockFetchSequence({ body: 'uuid-new', status: 200 }, { body: mockDictionary })

      await client.addDictionaryWord({
        surface: 'テスト',
        pronunciation: 'テスト',
      })

      const addCall = vi.mocked(fetch).mock.calls[0]
      // "テスト" は3モーラなので accentType=3
      expect(String(addCall[0])).toContain('accent_type=3')
    })

    it('accentType 明示で notation parsing をスキップ', async () => {
      mockFetchSequence({ body: 'uuid-new', status: 200 }, { body: mockDictionary })

      await client.addDictionaryWord({
        surface: 'テスト',
        pronunciation: 'ボイス[ボッ]クス',
        accentType: 1,
      })

      const addCall = vi.mocked(fetch).mock.calls[0]
      // accentType=1 を明示しているので brackets は無視される
      expect(String(addCall[0])).toContain('accent_type=1')
    })

    it('非カタカナで例外', async () => {
      await expect(client.addDictionaryWord({ surface: 'テスト', pronunciation: 'hello' })).rejects.toThrow(
        'pronunciation must be Katakana'
      )
    })

    it('空 surface で例外', async () => {
      await expect(client.addDictionaryWord({ surface: '  ', pronunciation: 'テスト' })).rejects.toThrow(
        'surface is required'
      )
    })
  })

  describe('addDictionaryWords', () => {
    it('バルク追加', async () => {
      // 2 add calls + 1 getDictionary
      mockFetchSequence({ body: 'uuid-a', status: 200 }, { body: 'uuid-b', status: 200 }, { body: mockDictionary })

      const result = await client.addDictionaryWords([
        { surface: 'A', pronunciation: 'エー' },
        { surface: 'B', pronunciation: 'ビー' },
      ])

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
      expect(result).toHaveLength(2)
    })
  })

  describe('updateDictionaryWord', () => {
    it('pronunciation 省略で既存値維持', async () => {
      // getUserDictionary + updateUserDictionaryWord + getDictionary
      mockFetchSequence({ body: mockDictionary }, { body: '', status: 200 }, { body: mockDictionary })

      const result = await client.updateDictionaryWord({
        wordUuid: 'uuid-1',
        surface: '新テスト',
      })

      const updateCall = vi.mocked(fetch).mock.calls[1]
      expect(String(updateCall[0])).toContain('/user_dict_word/uuid-1')
      expect((updateCall[1] as RequestInit).method).toBe('PUT')
      // pronunciation should be existing value
      expect(String(updateCall[0])).toContain('accent_type=1')
      expect(result).toHaveLength(2)
    })

    it('pronunciation 更新（notation 入力）', async () => {
      mockFetchSequence({ body: mockDictionary }, { body: '', status: 200 }, { body: mockDictionary })

      await client.updateDictionaryWord({
        wordUuid: 'uuid-1',
        pronunciation: 'テ[ス]ト',
      })

      const updateCall = vi.mocked(fetch).mock.calls[1]
      expect(String(updateCall[0])).toContain('accent_type=2')
    })

    it('存在しない wordUuid で例外', async () => {
      mockFetchSequence({ body: mockDictionary })

      await expect(client.updateDictionaryWord({ wordUuid: 'not-exist', surface: 'x' })).rejects.toThrow(
        'Word not found: not-exist'
      )
    })
  })

  describe('updateDictionaryWords', () => {
    it('バルク更新', async () => {
      // getUserDictionary + 2 update calls + getDictionary
      mockFetchSequence(
        { body: mockDictionary },
        { body: '', status: 200 },
        { body: '', status: 200 },
        { body: mockDictionary }
      )

      const result = await client.updateDictionaryWords([
        { wordUuid: 'uuid-1', surface: '新1' },
        { wordUuid: 'uuid-2', priority: 3 },
      ])

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4)
      expect(result).toHaveLength(2)
    })
  })

  describe('deleteDictionaryWord', () => {
    it('削除後の辞書を返す', async () => {
      // delete + getDictionary
      const afterDelete = { 'uuid-2': mockDictionary['uuid-2'] }
      mockFetchSequence({ body: '', status: 200 }, { body: afterDelete })

      const result = await client.deleteDictionaryWord('uuid-1')

      const deleteCall = vi.mocked(fetch).mock.calls[0]
      expect(String(deleteCall[0])).toContain('/user_dict_word/uuid-1')
      expect((deleteCall[1] as RequestInit).method).toBe('DELETE')
      expect(result).toHaveLength(1)
    })

    it('空 wordUuid で例外', async () => {
      await expect(client.deleteDictionaryWord('  ')).rejects.toThrow('wordUuid is required')
    })
  })

  describe('getAccentNotation', () => {
    it('テキストから notation を返す', async () => {
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
      mockFetchSequence({ body: mockPhrases })

      const result = await client.getAccentNotation('こんにちは')

      expect(result.notation).toBe('コン[ニ]チワ')
      expect(result.accentPhrases).toEqual(mockPhrases)
    })

    it('空テキストで例外', async () => {
      await expect(client.getAccentNotation('  ')).rejects.toThrow('text is required')
    })
  })
})
