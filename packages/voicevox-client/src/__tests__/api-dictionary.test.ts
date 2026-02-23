import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoicevoxApi } from '../api'

const BASE_URL = 'http://localhost:50021'

describe('VoicevoxApi - user dictionary methods', () => {
  let api: VoicevoxApi

  beforeEach(() => {
    vi.resetAllMocks()
    api = new VoicevoxApi(BASE_URL)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getUserDictionary', () => {
    it('GET /user_dict を呼び出して辞書を返す', async () => {
      const mockWords = {
        'uuid-1': { surface: 'テスト', pronunciation: 'テスト', accent_type: 1, word_type: 'PROPER_NOUN', priority: 5 },
      }
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(mockWords), { status: 200 }))

      const result = await api.getUserDictionary()

      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/user_dict`, expect.objectContaining({ method: 'GET' }))
      expect(result).toEqual(mockWords)
    })
  })

  describe('addUserDictionaryWord', () => {
    it('POST /user_dict_word を正しいクエリパラメータで呼び出す', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('uuid-new', { status: 200 }))

      await api.addUserDictionaryWord({
        surface: 'VOICEVOX',
        pronunciation: 'ボイスボックス',
        accentType: 3,
        priority: 7,
      })

      const [url] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('/user_dict_word')
      expect(String(url)).toContain('surface=VOICEVOX')
      expect(String(url)).toContain('pronunciation=%E3%83%9C%E3%82%A4%E3%82%B9%E3%83%9C%E3%83%83%E3%82%AF%E3%82%B9')
      expect(String(url)).toContain('accent_type=3')
      expect(String(url)).toContain('priority=7')
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    })
  })

  describe('updateUserDictionaryWord', () => {
    it('PUT /user_dict_word/:uuid を呼び出す', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))

      await api.updateUserDictionaryWord({
        wordUuid: 'my-uuid',
        surface: 'updated',
        pronunciation: 'アップデート',
        accentType: 2,
        priority: 3,
      })

      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('/user_dict_word/my-uuid')
      expect((init as RequestInit).method).toBe('PUT')
    })
  })

  describe('deleteUserDictionaryWord', () => {
    it('DELETE /user_dict_word/:uuid を呼び出す', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))

      await api.deleteUserDictionaryWord('del-uuid')

      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('/user_dict_word/del-uuid')
      expect((init as RequestInit).method).toBe('DELETE')
    })
  })

  describe('updateMoraData', () => {
    it('POST /mora_data を呼び出してアクセント句を返す', async () => {
      const inputPhrases = [{ moras: [{ text: 'テ', vowel: 'e', vowel_length: 0.1, pitch: 5.0 }], accent: 1 }]
      const outputPhrases = [{ moras: [{ text: 'テ', vowel: 'e', vowel_length: 0.12, pitch: 5.2 }], accent: 1 }]
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(outputPhrases), { status: 200 }))

      const result = await api.updateMoraData(inputPhrases as any, 1)

      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toContain('/mora_data?speaker=1')
      expect((init as RequestInit).method).toBe('POST')
      expect(result).toEqual(outputPhrases)
    })
  })

  describe('getSpeakerInfo', () => {
    it('GET /speaker_info を呼び出して portrait を含む SpeakerInfo を返す', async () => {
      const mockInfo = {
        policy: 'some policy',
        portrait: 'base64imagedata',
        style_infos: [{ id: 1, icon: 'icondata', voice_samples: [] }],
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(mockInfo), { status: 200 }))

      const result = await api.getSpeakerInfo('test-uuid')

      expect(result.portrait).toBe('base64imagedata')
      expect(result.style_infos).toHaveLength(1)
    })
  })
})
