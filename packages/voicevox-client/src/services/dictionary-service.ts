import {
  accentPhrasesToNotation,
  estimateAccentType,
  isKatakana,
  normalizeUserDictionaryWords,
  parseAccentNotation,
} from '../accent-utils.js'
import type { NormalizedDictionaryWord } from '../accent-utils.js'
import type { VoicevoxApi } from '../api.js'
import { handleError } from '../error.js'
import type { AccentPhrase } from '../types.js'

export interface DictionaryWordInput {
  surface: string
  pronunciation: string
  accentType?: number
  priority?: number
  wordType?: string
}

export interface DictionaryWordUpdateInput {
  wordUuid: string
  surface?: string
  pronunciation?: string
  accentType?: number
  priority?: number
  wordType?: string
}

export class DictionaryService {
  constructor(
    private readonly api: VoicevoxApi,
    private readonly defaultSpeaker: number
  ) {}

  public async getDictionary(): Promise<NormalizedDictionaryWord[]> {
    try {
      const dictionary = await this.api.getUserDictionary()
      return normalizeUserDictionaryWords(dictionary)
    } catch (error) {
      throw handleError('辞書取得中にエラーが発生しました', error)
    }
  }

  public async addDictionaryWord(input: DictionaryWordInput): Promise<NormalizedDictionaryWord[]> {
    try {
      const { pronunciation, accentType } = this.resolvePronunciation(input.pronunciation, input.accentType)
      const surface = input.surface.trim()
      if (!surface) throw new Error('surface is required')

      await this.api.addUserDictionaryWord({
        surface,
        pronunciation,
        accentType,
        priority: input.priority ?? 5,
        wordType: input.wordType,
      })

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語追加中にエラーが発生しました', error)
    }
  }

  public async addDictionaryWords(inputs: DictionaryWordInput[]): Promise<NormalizedDictionaryWord[]> {
    try {
      for (const input of inputs) {
        const { pronunciation, accentType } = this.resolvePronunciation(input.pronunciation, input.accentType)
        const surface = input.surface.trim()
        if (!surface) throw new Error('surface is required')

        await this.api.addUserDictionaryWord({
          surface,
          pronunciation,
          accentType,
          priority: input.priority ?? 5,
          wordType: input.wordType,
        })
      }

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語バルク追加中にエラーが発生しました', error)
    }
  }

  public async updateDictionaryWord(input: DictionaryWordUpdateInput): Promise<NormalizedDictionaryWord[]> {
    try {
      const wordUuid = input.wordUuid.trim()
      if (!wordUuid) throw new Error('wordUuid is required')

      const dictionary = await this.api.getUserDictionary()
      const existing = dictionary[wordUuid]
      if (!existing) throw new Error(`Word not found: ${wordUuid}`)

      const effectiveSurface = input.surface?.trim() || existing.surface
      const effectivePriority = input.priority ?? existing.priority

      let effectivePronunciation: string
      let effectiveAccentType: number
      if (input.pronunciation?.trim()) {
        const resolved = this.resolvePronunciation(input.pronunciation, input.accentType)
        effectivePronunciation = resolved.pronunciation
        effectiveAccentType = resolved.accentType
      } else if (input.accentType !== undefined) {
        effectivePronunciation = existing.pronunciation
        effectiveAccentType = input.accentType
      } else {
        effectivePronunciation = existing.pronunciation
        effectiveAccentType = existing.accent_type
      }

      await this.api.updateUserDictionaryWord({
        wordUuid,
        surface: effectiveSurface,
        pronunciation: effectivePronunciation,
        accentType: effectiveAccentType,
        priority: effectivePriority,
        wordType: input.wordType,
      })

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語更新中にエラーが発生しました', error)
    }
  }

  public async updateDictionaryWords(inputs: DictionaryWordUpdateInput[]): Promise<NormalizedDictionaryWord[]> {
    try {
      const dictionary = await this.api.getUserDictionary()

      for (const input of inputs) {
        const wordUuid = input.wordUuid.trim()
        if (!wordUuid) throw new Error('wordUuid is required')

        const existing = dictionary[wordUuid]
        if (!existing) throw new Error(`Word not found: ${wordUuid}`)

        const effectiveSurface = input.surface?.trim() || existing.surface
        const effectivePriority = input.priority ?? existing.priority

        let effectivePronunciation: string
        let effectiveAccentType: number
        if (input.pronunciation?.trim()) {
          const resolved = this.resolvePronunciation(input.pronunciation, input.accentType)
          effectivePronunciation = resolved.pronunciation
          effectiveAccentType = resolved.accentType
        } else if (input.accentType !== undefined) {
          effectivePronunciation = existing.pronunciation
          effectiveAccentType = input.accentType
        } else {
          effectivePronunciation = existing.pronunciation
          effectiveAccentType = existing.accent_type
        }

        await this.api.updateUserDictionaryWord({
          wordUuid,
          surface: effectiveSurface,
          pronunciation: effectivePronunciation,
          accentType: effectiveAccentType,
          priority: effectivePriority,
          wordType: input.wordType,
        })
      }

      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語バルク更新中にエラーが発生しました', error)
    }
  }

  public async deleteDictionaryWord(wordUuid: string): Promise<NormalizedDictionaryWord[]> {
    try {
      const normalizedUuid = wordUuid.trim()
      if (!normalizedUuid) throw new Error('wordUuid is required')

      await this.api.deleteUserDictionaryWord(normalizedUuid)
      return this.getDictionary()
    } catch (error) {
      throw handleError('辞書単語削除中にエラーが発生しました', error)
    }
  }

  public async getAccentNotation(
    text: string,
    speaker?: number
  ): Promise<{ notation: string; accentPhrases: AccentPhrase[] }> {
    try {
      const normalizedText = text.trim()
      if (!normalizedText) throw new Error('text is required')
      const effectiveSpeaker = speaker ?? this.defaultSpeaker
      const accentPhrases = await this.api.getAccentPhrases(normalizedText, effectiveSpeaker)
      const notation = accentPhrasesToNotation(accentPhrases)
      return { notation, accentPhrases }
    } catch (error) {
      throw handleError('アクセント表記取得中にエラーが発生しました', error)
    }
  }

  private resolvePronunciation(input: string, accentType?: number): { pronunciation: string; accentType: number } {
    const trimmed = input.trim()
    if (!trimmed) throw new Error('pronunciation is required')

    if (accentType !== undefined) {
      const clean = trimmed.replace(/\[|\]/g, '')
      if (!isKatakana(clean)) throw new Error('pronunciation must be Katakana')
      return { pronunciation: clean, accentType }
    }

    if (trimmed.includes('[')) {
      const result = parseAccentNotation(trimmed)
      if (!isKatakana(result.pronunciation)) throw new Error('pronunciation must be Katakana')
      return result
    }

    if (!isKatakana(trimmed)) throw new Error('pronunciation must be Katakana')
    return { pronunciation: trimmed, accentType: estimateAccentType(trimmed) }
  }
}
