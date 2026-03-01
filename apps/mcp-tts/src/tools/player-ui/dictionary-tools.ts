import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerAppToolIfEnabled } from '../registration.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'
import { estimateAccentType, isKatakana, normalizeUserDictionaryWords } from './dictionary-utils.js'

export function registerPlayerDictionaryTools(context: PlayerUIToolContext): void {
  const { deps, shared } = context
  const { server, disabledTools, config } = deps
  const { playerVoicevoxApi, playerResourceUri, getSpeakerList, synthesizeWithCache } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_user_dictionary_for_player',
    {
      title: 'Get User Dictionary (Player)',
      description: 'Get VOICEVOX user dictionary words for the dictionary manager UI.',
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const dictionary = await playerVoicevoxApi.getUserDictionary()
        return {
          content: [{ type: 'text', text: JSON.stringify({ words: normalizeUserDictionaryWords(dictionary) }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_add_user_dictionary_word_for_player',
    {
      title: 'Add User Dictionary Word (Player)',
      description: 'Add a word to VOICEVOX user dictionary.',
      inputSchema: {
        surface: z.string().describe('Word surface form'),
        pronunciation: z.string().describe('Katakana reading'),
        priority: z.number().int().min(0).max(10).optional().describe('Priority 0-10'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({
      surface,
      pronunciation,
      priority,
    }: { surface: string; pronunciation: string; priority?: number }): Promise<CallToolResult> => {
      try {
        const normalizedSurface = surface.trim()
        const normalizedPronunciation = pronunciation.trim()
        if (!normalizedSurface) throw new Error('surface is required')
        if (!normalizedPronunciation) throw new Error('pronunciation is required')
        if (!isKatakana(normalizedPronunciation)) throw new Error('pronunciation must be Katakana')

        await playerVoicevoxApi.addUserDictionaryWord({
          surface: normalizedSurface,
          pronunciation: normalizedPronunciation,
          accentType: estimateAccentType(normalizedPronunciation),
          priority: priority ?? 5,
        })
        const dictionary = await playerVoicevoxApi.getUserDictionary()
        return {
          content: [{ type: 'text', text: JSON.stringify({ words: normalizeUserDictionaryWords(dictionary) }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_update_user_dictionary_word_for_player',
    {
      title: 'Update User Dictionary Word (Player)',
      description: 'Update a VOICEVOX user dictionary word.',
      inputSchema: {
        wordUuid: z.string().describe('Dictionary word UUID'),
        surface: z.string().describe('Word surface form'),
        pronunciation: z.string().describe('Katakana reading'),
        priority: z.number().int().min(0).max(10).optional().describe('Priority 0-10'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({
      wordUuid,
      surface,
      pronunciation,
      priority,
    }: { wordUuid: string; surface: string; pronunciation: string; priority?: number }): Promise<CallToolResult> => {
      try {
        const normalizedSurface = surface.trim()
        const normalizedPronunciation = pronunciation.trim()
        if (!wordUuid.trim()) throw new Error('wordUuid is required')
        if (!normalizedSurface) throw new Error('surface is required')
        if (!normalizedPronunciation) throw new Error('pronunciation is required')
        if (!isKatakana(normalizedPronunciation)) throw new Error('pronunciation must be Katakana')

        await playerVoicevoxApi.updateUserDictionaryWord({
          wordUuid: wordUuid.trim(),
          surface: normalizedSurface,
          pronunciation: normalizedPronunciation,
          accentType: estimateAccentType(normalizedPronunciation),
          priority: priority ?? 5,
        })
        const dictionary = await playerVoicevoxApi.getUserDictionary()
        return {
          content: [{ type: 'text', text: JSON.stringify({ words: normalizeUserDictionaryWords(dictionary) }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_delete_user_dictionary_word_for_player',
    {
      title: 'Delete User Dictionary Word (Player)',
      description: 'Delete a VOICEVOX user dictionary word.',
      inputSchema: {
        wordUuid: z.string().describe('Dictionary word UUID'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({ wordUuid }: { wordUuid: string }): Promise<CallToolResult> => {
      try {
        const normalizedWordUuid = wordUuid.trim()
        if (!normalizedWordUuid) throw new Error('wordUuid is required')

        await playerVoicevoxApi.deleteUserDictionaryWord(normalizedWordUuid)
        const dictionary = await playerVoicevoxApi.getUserDictionary()
        return {
          content: [{ type: 'text', text: JSON.stringify({ words: normalizeUserDictionaryWords(dictionary) }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_preview_dictionary_word_for_player',
    {
      title: 'Preview Dictionary Word (Player)',
      description: 'Preview pronunciation with a random speaker.',
      inputSchema: {
        text: z.string().describe('Text to preview'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({ text }: { text: string }): Promise<CallToolResult> => {
      try {
        const normalizedText = text.trim()
        if (!normalizedText) throw new Error('text is required')
        const speakers = await getSpeakerList()
        if (speakers.length === 0) throw new Error('No speakers available')

        const randomSpeaker = speakers[Math.floor(Math.random() * speakers.length)]
        const result = await synthesizeWithCache({
          text: normalizedText,
          speaker: randomSpeaker.id,
          speedScale: config.defaultSpeedScale,
        })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                audioBase64: result.audioBase64,
                speaker: result.speaker,
                speakerName: result.speakerName,
                kana: result.kana,
              }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
