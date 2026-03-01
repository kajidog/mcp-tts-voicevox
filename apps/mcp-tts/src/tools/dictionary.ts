import { VoicevoxApi } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import {
  type NormalizedDictionaryWord,
  estimateAccentType,
  insertAccentBrackets,
  isKatakana,
  normalizeUserDictionaryWords,
  parseAccentNotation,
} from './player-ui/dictionary-utils.js'
import { accentPhrasesToNotation } from './player/phrase-utils.js'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps } from './types.js'
import { createErrorResponse } from './utils.js'

/**
 * Parse pronunciation input: supports both plain katakana and inline accent notation.
 * Returns { pronunciation, accentType } ready for VOICEVOX API.
 */
function parsePronunciationInput(input: string): { pronunciation: string; accentType: number } {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('pronunciation is required')
  if (trimmed.includes('[')) {
    const result = parseAccentNotation(trimmed)
    if (!isKatakana(result.pronunciation)) throw new Error('pronunciation must be Katakana')
    return result
  }
  if (!isKatakana(trimmed)) throw new Error('pronunciation must be Katakana')
  return { pronunciation: trimmed, accentType: estimateAccentType(trimmed) }
}

export function registerDictionaryTools(deps: ToolDeps) {
  const { server, voicevoxClient, config, disabledTools } = deps
  const api = new VoicevoxApi(config.voicevoxUrl)

  // get_accent_phrases
  registerToolIfEnabled(
    server,
    disabledTools,
    'get_accent_phrases',
    {
      title: 'Get Accent Phrases',
      description:
        'Get accent phrases (reading and accent positions) from text. Returns inline notation like "コン[ニ]チワ,セ[カ]イ" where brackets indicate accent position.',
      inputSchema: {
        text: z.string().describe('Text to analyze'),
        speaker: z.number().optional().describe('Speaker ID (optional, affects pronunciation)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ text, speaker }: { text: string; speaker?: number }): Promise<CallToolResult> => {
      try {
        const normalizedText = text.trim()
        if (!normalizedText) throw new Error('text is required')
        const effectiveSpeaker = speaker ?? config.defaultSpeaker
        const accentPhrases = await api.getAccentPhrases(normalizedText, effectiveSpeaker)
        const notation = accentPhrasesToNotation(accentPhrases)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ notation, accentPhrases }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // get_user_dictionary
  registerToolIfEnabled(
    server,
    disabledTools,
    'get_user_dictionary',
    {
      title: 'Get User Dictionary',
      description:
        'Get words in the VOICEVOX user dictionary. Supports filtering by query and pagination. Pronunciation uses inline accent notation (e.g. "ボイス[ボッ]クス").',
      inputSchema: {
        query: z.string().optional().describe('Filter by surface or pronunciation (partial match, case-insensitive)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset (default: 0)'),
        limit: z.number().int().min(1).max(200).optional().describe('Max words to return (default: 50)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, offset, limit }: { query?: string; offset?: number; limit?: number }): Promise<CallToolResult> => {
      try {
        const dictionary = await api.getUserDictionary()
        let words = normalizeUserDictionaryWords(dictionary)

        if (query) {
          const q = query.toLowerCase()
          words = words.filter((w) => w.surface.toLowerCase().includes(q) || w.pronunciation.toLowerCase().includes(q))
        }

        const totalCount = words.length
        const effectiveOffset = offset ?? 0
        const effectiveLimit = limit ?? 50
        const paged = words.slice(effectiveOffset, effectiveOffset + effectiveLimit)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                words: paged,
                totalCount,
                offset: effectiveOffset,
                limit: effectiveLimit,
              }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // add_user_dictionary_word
  registerToolIfEnabled(
    server,
    disabledTools,
    'add_user_dictionary_word',
    {
      title: 'Add User Dictionary Word',
      description:
        'Add a word to the VOICEVOX user dictionary. Pronunciation supports inline accent notation (e.g. "ボイス[ボッ]クス"). If brackets are omitted, accent is auto-estimated.',
      inputSchema: {
        surface: z.string().describe('Word surface form (the text to match)'),
        pronunciation: z
          .string()
          .describe('Katakana reading with optional inline accent notation (e.g. "ボイス[ボッ]クス")'),
        priority: z.number().int().min(0).max(10).optional().describe('Priority 0-10 (default: 5)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      surface,
      pronunciation,
      priority,
    }: {
      surface: string
      pronunciation: string
      priority?: number
    }): Promise<CallToolResult> => {
      try {
        const normalizedSurface = surface.trim()
        if (!normalizedSurface) throw new Error('surface is required')
        const parsed = parsePronunciationInput(pronunciation)

        await api.addUserDictionaryWord({
          surface: normalizedSurface,
          pronunciation: parsed.pronunciation,
          accentType: parsed.accentType,
          priority: priority ?? 5,
        })

        // Find the added word by fetching dictionary
        const dictionary = await api.getUserDictionary()
        const addedEntry = Object.entries(dictionary).find(
          ([, w]) => w.surface === normalizedSurface && w.pronunciation === parsed.pronunciation
        )
        const word: NormalizedDictionaryWord = addedEntry
          ? {
              wordUuid: addedEntry[0],
              surface: addedEntry[1].surface,
              pronunciation: insertAccentBrackets(addedEntry[1].pronunciation, addedEntry[1].accent_type),
              priority: addedEntry[1].priority,
            }
          : {
              wordUuid: '',
              surface: normalizedSurface,
              pronunciation: insertAccentBrackets(parsed.pronunciation, parsed.accentType),
              priority: priority ?? 5,
            }

        return {
          content: [{ type: 'text', text: JSON.stringify({ word }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // update_user_dictionary_word
  registerToolIfEnabled(
    server,
    disabledTools,
    'update_user_dictionary_word',
    {
      title: 'Update User Dictionary Word',
      description:
        'Update a word in the VOICEVOX user dictionary. surface and pronunciation are optional — omitted fields keep their existing values. Pronunciation supports inline accent notation.',
      inputSchema: {
        wordUuid: z.string().describe('Dictionary word UUID'),
        surface: z.string().optional().describe('Word surface form (omit to keep existing)'),
        pronunciation: z
          .string()
          .optional()
          .describe('Katakana reading with optional inline accent notation (omit to keep existing)'),
        priority: z.number().int().min(0).max(10).optional().describe('Priority 0-10 (omit to keep existing)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      wordUuid,
      surface,
      pronunciation,
      priority,
    }: {
      wordUuid: string
      surface?: string
      pronunciation?: string
      priority?: number
    }): Promise<CallToolResult> => {
      try {
        const normalizedWordUuid = wordUuid.trim()
        if (!normalizedWordUuid) throw new Error('wordUuid is required')

        // Fetch existing word to merge omitted fields
        const dictionary = await api.getUserDictionary()
        const existing = dictionary[normalizedWordUuid]
        if (!existing) throw new Error(`Word not found: ${normalizedWordUuid}`)

        const effectiveSurface = surface?.trim() || existing.surface
        const effectivePriority = priority ?? existing.priority

        let effectivePronunciation: string
        let effectiveAccentType: number
        if (pronunciation?.trim()) {
          const parsed = parsePronunciationInput(pronunciation)
          effectivePronunciation = parsed.pronunciation
          effectiveAccentType = parsed.accentType
        } else {
          effectivePronunciation = existing.pronunciation
          effectiveAccentType = existing.accent_type
        }

        await api.updateUserDictionaryWord({
          wordUuid: normalizedWordUuid,
          surface: effectiveSurface,
          pronunciation: effectivePronunciation,
          accentType: effectiveAccentType,
          priority: effectivePriority,
        })

        const word: NormalizedDictionaryWord = {
          wordUuid: normalizedWordUuid,
          surface: effectiveSurface,
          pronunciation: insertAccentBrackets(effectivePronunciation, effectiveAccentType),
          priority: effectivePriority,
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({ word }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // delete_user_dictionary_word
  registerToolIfEnabled(
    server,
    disabledTools,
    'delete_user_dictionary_word',
    {
      title: 'Delete User Dictionary Word',
      description: 'Delete a word from the VOICEVOX user dictionary.',
      inputSchema: {
        wordUuid: z.string().describe('Dictionary word UUID'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ wordUuid }: { wordUuid: string }): Promise<CallToolResult> => {
      try {
        const normalizedWordUuid = wordUuid.trim()
        if (!normalizedWordUuid) throw new Error('wordUuid is required')

        await api.deleteUserDictionaryWord(normalizedWordUuid)
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, deletedWordUuid: normalizedWordUuid }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // add_user_dictionary_words (bulk)
  registerToolIfEnabled(
    server,
    disabledTools,
    'add_user_dictionary_words',
    {
      title: 'Bulk Add User Dictionary Words',
      description:
        'Add multiple words to the VOICEVOX user dictionary at once. Pronunciation supports inline accent notation.',
      inputSchema: {
        words: z
          .array(
            z.object({
              surface: z.string().describe('Word surface form'),
              pronunciation: z.string().describe('Katakana reading with optional inline accent notation'),
              priority: z.number().int().min(0).max(10).optional().describe('Priority 0-10 (default: 5)'),
            })
          )
          .min(1)
          .max(100)
          .describe('Words to add (max 100)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      words,
    }: {
      words: Array<{ surface: string; pronunciation: string; priority?: number }>
    }): Promise<CallToolResult> => {
      try {
        const addedWords: NormalizedDictionaryWord[] = []
        for (const w of words) {
          const normalizedSurface = w.surface.trim()
          if (!normalizedSurface) throw new Error('surface is required')
          const parsed = parsePronunciationInput(w.pronunciation)

          await api.addUserDictionaryWord({
            surface: normalizedSurface,
            pronunciation: parsed.pronunciation,
            accentType: parsed.accentType,
            priority: w.priority ?? 5,
          })

          addedWords.push({
            wordUuid: '',
            surface: normalizedSurface,
            pronunciation: insertAccentBrackets(parsed.pronunciation, parsed.accentType),
            priority: w.priority ?? 5,
          })
        }

        // Fetch dictionary to resolve UUIDs
        const dictionary = await api.getUserDictionary()
        for (const added of addedWords) {
          const entry = Object.entries(dictionary).find(
            ([, w]) => w.surface === added.surface && w.pronunciation === added.pronunciation.replace(/\[|\]/g, '')
          )
          if (entry) added.wordUuid = entry[0]
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ addedCount: addedWords.length, words: addedWords }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // update_user_dictionary_words (bulk)
  registerToolIfEnabled(
    server,
    disabledTools,
    'update_user_dictionary_words',
    {
      title: 'Bulk Update User Dictionary Words',
      description:
        'Update multiple words in the VOICEVOX user dictionary at once. surface and pronunciation are optional per word — omitted fields keep existing values.',
      inputSchema: {
        words: z
          .array(
            z.object({
              wordUuid: z.string().describe('Dictionary word UUID'),
              surface: z.string().optional().describe('Word surface form (omit to keep existing)'),
              pronunciation: z
                .string()
                .optional()
                .describe('Katakana reading with optional inline accent notation (omit to keep existing)'),
              priority: z.number().int().min(0).max(10).optional().describe('Priority 0-10 (omit to keep existing)'),
            })
          )
          .min(1)
          .max(100)
          .describe('Words to update (max 100)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      words,
    }: {
      words: Array<{ wordUuid: string; surface?: string; pronunciation?: string; priority?: number }>
    }): Promise<CallToolResult> => {
      try {
        // Fetch dictionary once for merging
        const dictionary = await api.getUserDictionary()
        const updatedWords: NormalizedDictionaryWord[] = []

        for (const w of words) {
          const normalizedWordUuid = w.wordUuid.trim()
          if (!normalizedWordUuid) throw new Error('wordUuid is required')

          const existing = dictionary[normalizedWordUuid]
          if (!existing) throw new Error(`Word not found: ${normalizedWordUuid}`)

          const effectiveSurface = w.surface?.trim() || existing.surface
          const effectivePriority = w.priority ?? existing.priority

          let effectivePronunciation: string
          let effectiveAccentType: number
          if (w.pronunciation?.trim()) {
            const parsed = parsePronunciationInput(w.pronunciation)
            effectivePronunciation = parsed.pronunciation
            effectiveAccentType = parsed.accentType
          } else {
            effectivePronunciation = existing.pronunciation
            effectiveAccentType = existing.accent_type
          }

          await api.updateUserDictionaryWord({
            wordUuid: normalizedWordUuid,
            surface: effectiveSurface,
            pronunciation: effectivePronunciation,
            accentType: effectiveAccentType,
            priority: effectivePriority,
          })

          updatedWords.push({
            wordUuid: normalizedWordUuid,
            surface: effectiveSurface,
            pronunciation: insertAccentBrackets(effectivePronunciation, effectiveAccentType),
            priority: effectivePriority,
          })
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ updatedCount: updatedWords.length, words: updatedWords }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
