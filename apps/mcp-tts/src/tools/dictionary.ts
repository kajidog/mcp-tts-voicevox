import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { bumpPlayerDictionaryRevision } from './player/dictionary-revision.js'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps } from './types.js'
import { createErrorResponse } from './utils.js'

export function registerDictionaryTools(deps: ToolDeps) {
  const { server, voicevoxClient, config, disabledTools } = deps

  // get_accent_phrases
  registerToolIfEnabled(
    server,
    disabledTools,
    'get_accent_phrases',
    {
      title: 'Get Accent Phrases',
      description:
        'Analyze text and return its reading with accent positions in inline notation (e.g. "コン[ニ]チワ,セ[カ]イ"). Use to preview or prepare phrases for speak.',
      inputSchema: {
        text: z.string().describe('Text to analyze'),
        speaker: z.number().optional().describe('Speaker ID (affects pronunciation estimation).'),
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
        const result = await voicevoxClient.getAccentNotation(text, speaker ?? config.defaultSpeaker)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
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
      description: 'List words in the user pronunciation dictionary. Supports filtering and pagination.',
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
        let words = await voicevoxClient.getDictionary()

        if (query) {
          const q = query.toLowerCase()
          words = words.filter(
            (w) =>
              w.surface.toLowerCase().includes(q) ||
              w.pronunciation.toLowerCase().includes(q) ||
              w.notation.toLowerCase().includes(q)
          )
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
      description: 'Add a word to the pronunciation dictionary. Affects future speech synthesis.',
      inputSchema: {
        surface: z.string().describe('Word surface form (text that triggers this dictionary entry).'),
        pronunciation: z
          .string()
          .describe('Katakana reading. Optional accent brackets: "ボイス[ボッ]クス". Omit brackets for auto accent.'),
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
        const words = await voicevoxClient.addDictionaryWord({ surface, pronunciation, priority })
        bumpPlayerDictionaryRevision()

        // Find the added word
        const normalizedSurface = surface.trim()
        const word = words.find((w) => w.surface === normalizedSurface) ?? words[words.length - 1]

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
      description: 'Update a word in the pronunciation dictionary. Omitted fields keep existing values.',
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
        const words = await voicevoxClient.updateDictionaryWord({ wordUuid, surface, pronunciation, priority })
        bumpPlayerDictionaryRevision()
        const word = words.find((w) => w.wordUuid === wordUuid.trim())

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
      description: 'Delete a word from the pronunciation dictionary.',
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

        await voicevoxClient.deleteDictionaryWord(normalizedWordUuid)
        bumpPlayerDictionaryRevision()
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
      description: 'Add multiple words to the pronunciation dictionary in one call.',
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
        const result = await voicevoxClient.addDictionaryWords(words)
        bumpPlayerDictionaryRevision()

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ addedCount: words.length, words: result }),
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
        'Update multiple words in the pronunciation dictionary in one call. Omitted fields keep existing values.',
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
        const result = await voicevoxClient.updateDictionaryWords(words)
        bumpPlayerDictionaryRevision()

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ updatedCount: words.length, words: result }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
