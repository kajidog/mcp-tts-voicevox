import { spawn, spawnSync } from 'node:child_process'
import { constants, accessSync, mkdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { AccentPhrase, AudioQuery, Mora, VoicevoxApi } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerAppToolIfEnabled } from './registration.js'
import type { ToolDeps, ToolHandlerExtra } from './types.js'
import { createErrorResponse } from './utils.js'

// ---------------------------------------------------------------------------
// Shared dependencies injected from player.ts
// ---------------------------------------------------------------------------

type SynthesizeResult = {
  audioBase64: string
  text: string
  speaker: number
  speakerName: string
  kana?: string
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
  speedScale: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
}

type SpeakerEntry = { id: number; name: string; characterName: string; uuid: string }

export interface PlayerUIShared {
  playerVoicevoxApi: VoicevoxApi
  playerResourceUri: string
  synthesizeWithCache: (input: {
    text: string
    speaker: number
    audioQuery?: AudioQuery
    speedScale: number
    intonationScale?: number
    volumeScale?: number
    prePhonemeLength?: number
    postPhonemeLength?: number
    pauseLengthScale?: number
    accentPhrases?: AccentPhrase[]
  }) => Promise<SynthesizeResult>
  setSessionState: (
    key: string,
    state: {
      segments: {
        text: string
        speaker: number
        speakerName?: string
        kana?: string
        audioQuery?: AudioQuery
        accentPhrases?: AccentPhrase[]
        speedScale: number
        intonationScale?: number
        volumeScale?: number
        prePhonemeLength?: number
        postPhonemeLength?: number
        pauseLengthScale?: number
      }[]
      updatedAt: number
    }
  ) => void
  getSessionState: (key: string) =>
    | {
        segments: {
          text: string
          speaker: number
          speakerName?: string
          kana?: string
          audioQuery?: AudioQuery
          accentPhrases?: AccentPhrase[]
          speedScale: number
          intonationScale?: number
          volumeScale?: number
          prePhonemeLength?: number
          postPhonemeLength?: number
          pauseLengthScale?: number
        }[]
        updatedAt: number
      }
    | undefined
  getSpeakerList: () => Promise<SpeakerEntry[]>
}

// ---------------------------------------------------------------------------
// Export utilities (only used by UI tools)
// ---------------------------------------------------------------------------

// Cache spawnSync results to avoid repeated blocking shell lookups
const commandExistsCache = new Map<string, boolean>()

function commandExists(command: string): boolean {
  if (commandExistsCache.has(command)) return commandExistsCache.get(command)!

  if (process.platform === 'win32' && command === 'explorer') {
    // Windowsのexplorer.exeはwhereコマンドで失敗することがあるため、確実に存在する前提にする
    commandExistsCache.set(command, true)
    return true
  }

  const checkCmd = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(checkCmd, [command], { stdio: 'ignore' })
  const exists = result.status === 0
  commandExistsCache.set(command, exists)
  return exists
}

function canOpenExplorer(): boolean {
  if (process.platform === 'win32') return commandExists('explorer')
  if (process.platform === 'darwin') return commandExists('open')
  if (process.platform === 'linux') {
    const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
    return hasDisplay && commandExists('xdg-open')
  }
  return false
}

function canChooseDirectoryDialog(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

// Check write capability without creating the directory as a side effect.
// If the directory exists, check it is writable.
// If it does not exist, check that the parent directory is writable.
function canWriteDirectory(directoryPath: string): boolean {
  try {
    accessSync(directoryPath, constants.W_OK)
    return true
  } catch {
    try {
      accessSync(dirname(resolve(directoryPath)), constants.W_OK)
      return true
    } catch {
      return false
    }
  }
}

function sanitizeFilePart(input: string, fallback: string): string {
  const value = input
    .trim()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional filename sanitization
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40)
  return value.length > 0 ? value : fallback
}

function openDirectoryInExplorer(directoryPath: string): boolean {
  try {
    const child =
      process.platform === 'win32'
        ? spawn('explorer', [directoryPath], { detached: true, stdio: 'ignore' })
        : process.platform === 'darwin'
          ? spawn('open', [directoryPath], { detached: true, stdio: 'ignore' })
          : spawn('xdg-open', [directoryPath], { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

function showDirectoryPicker(defaultPath?: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const defaultPathB64 = defaultPath ? Buffer.from(defaultPath).toString('base64') : ''
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $form = New-Object System.Windows.Forms.Form
        $form.TopMost = $true
        $form.ShowInTaskbar = $false
        $form.WindowState = 'Minimized'
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Select Export Folder"
        ${defaultPathB64 ? `$dialog.SelectedPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${defaultPathB64}"))` : ''}
        $dialog.ShowNewFolderButton = $true
        if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.SelectedPath
        }
      `
      const child = spawn('powershell', ['-NoProfile', '-Command', psScript], { stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
      child.on('close', () => {
        const path = output.trim()
        resolve(path || null)
      })
    } else if (process.platform === 'darwin') {
      const script = `on run argv
try
  ${defaultPath ? 'set defaultArg to item 1 of argv' : ''}
  return POSIX path of (choose folder with prompt "Select Export Folder" ${defaultPath ? 'default location POSIX file defaultArg' : ''})
on error
  return ""
end try
end run`
      const args = ['-e', script]
      if (defaultPath) args.push(defaultPath)
      const child = spawn('osascript', args, { stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
      child.on('close', () => {
        const path = output.trim()
        resolve(path || null)
      })
    } else {
      resolve(null)
    }
  })
}

function isKatakana(input: string): boolean {
  return /^[ァ-ヶー]+$/.test(input)
}

function estimateAccentType(pronunciation: string): number {
  const smallKana = new Set(['ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヮ'])
  let moraCount = 0
  for (const char of pronunciation) {
    if (char === 'ー') continue
    if (smallKana.has(char)) continue
    moraCount += 1
  }
  return Math.max(1, moraCount)
}

function normalizeUserDictionaryWords(
  dictionary: Record<string, { surface: string; pronunciation: string; accent_type: number; priority: number }>
) {
  return Object.entries(dictionary).map(([wordUuid, word]) => ({
    wordUuid,
    surface: word.surface,
    pronunciation: word.pronunciation,
    accentType: word.accent_type,
    priority: word.priority,
  }))
}

const moraSchema = z.object({
  text: z.string(),
  consonant: z.string().nullable().optional(),
  consonant_length: z.number().nullable().optional(),
  vowel: z.string(),
  vowel_length: z.number(),
  pitch: z.number(),
})

const accentPhraseSchema = z.object({
  moras: z.array(moraSchema),
  accent: z.number().int(),
  pause_mora: moraSchema.nullable().optional(),
  is_interrogative: z.boolean().nullable().optional(),
})

const audioQuerySchema = z.object({
  accent_phrases: z.array(accentPhraseSchema),
  speedScale: z.number(),
  pitchScale: z.number(),
  intonationScale: z.number(),
  volumeScale: z.number(),
  prePhonemeLength: z.number(),
  postPhonemeLength: z.number(),
  outputSamplingRate: z.number(),
  outputStereo: z.boolean(),
  kana: z.string().optional(),
  pauseLengthScale: z.number().optional(),
})

// ---------------------------------------------------------------------------

export function registerPlayerUITools(deps: ToolDeps, shared: PlayerUIShared): void {
  const { server, disabledTools, config } = deps
  const {
    playerVoicevoxApi,
    playerResourceUri,
    synthesizeWithCache,
    setSessionState,
    getSessionState,
    getSpeakerList,
  } = shared

  const speakerIconCache = new Map<string, string>()

  // スピーカー一覧取得（UIからcallServerToolで呼ぶ用）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_speakers_for_player',
    {
      title: 'Get Speakers (Player)',
      description: 'Get speaker list for the player UI. This tool is only callable from the app UI.',
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const list = await getSpeakerList()
        return { content: [{ type: 'text', text: JSON.stringify(list) }] }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // スピーカーアイコン取得
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_speaker_icon_for_player',
    {
      title: 'Get Speaker Icon (Player)',
      description: 'Get speaker portrait icon by UUID. Only callable from the app UI.',
      inputSchema: {
        speakerUuid: z.string().describe('Speaker UUID'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({ speakerUuid }: { speakerUuid: string }): Promise<CallToolResult> => {
      try {
        const cached = speakerIconCache.get(speakerUuid)
        if (cached) {
          return { content: [{ type: 'text', text: JSON.stringify({ portrait: cached }) }] }
        }

        const info = await playerVoicevoxApi.getSpeakerInfo(speakerUuid)
        const portrait = info.portrait
        if (portrait) {
          speakerIconCache.set(speakerUuid, portrait)
          return { content: [{ type: 'text', text: JSON.stringify({ portrait }) }] }
        }

        return { content: [{ type: 'text', text: JSON.stringify({ portrait: null }) }] }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // スピーカーを変更して再合成
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_save_player_state_for_player',
    {
      title: 'Save Player State (Player)',
      description:
        'Persist current player segments to server state without synthesizing audio. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().optional().describe('Player instance ID to associate this state with'),
        segments: z
          .array(
            z.object({
              text: z.string(),
              speaker: z.number(),
              speedScale: z.number().optional(),
              intonationScale: z.number().optional(),
              volumeScale: z.number().optional(),
              prePhonemeLength: z.number().optional(),
              postPhonemeLength: z.number().optional(),
              pauseLengthScale: z.number().optional(),
              audioQuery: audioQuerySchema.optional(),
              accentPhrases: z.array(accentPhraseSchema).optional(),
            })
          )
          .describe('Full current player segment list to persist'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (
      {
        viewUUID,
        segments,
      }: {
        viewUUID?: string
        segments: Array<{
          text: string
          speaker: number
          speedScale?: number
          intonationScale?: number
          volumeScale?: number
          prePhonemeLength?: number
          postPhonemeLength?: number
          pauseLengthScale?: number
          audioQuery?: AudioQuery
          accentPhrases?: AccentPhrase[]
        }>
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        if (!segments || segments.length === 0) {
          throw new Error('segments is required')
        }

        const stateKey = viewUUID ?? extra?.sessionId ?? 'global'
        const effectiveDefaultSpeaker = config.defaultSpeaker
        const effectiveSpeed = config.defaultSpeedScale
        const list = await getSpeakerList()
        const speakerNameMap = new Map<number, string>()
        for (const speakerId of [...new Set(segments.map((seg) => seg.speaker ?? effectiveDefaultSpeaker))]) {
          const found = list.find((entry) => entry.id === speakerId)
          speakerNameMap.set(speakerId, found ? `${found.characterName}（${found.name}）` : `Speaker ${speakerId}`)
        }

        setSessionState(stateKey, {
          segments: segments.map((seg) => {
            const speakerId = seg.speaker ?? effectiveDefaultSpeaker
            return {
              text: seg.text,
              speaker: speakerId,
              speakerName: speakerNameMap.get(speakerId) ?? `Speaker ${speakerId}`,
              kana: seg.audioQuery?.kana,
              speedScale: seg.speedScale ?? effectiveSpeed,
              intonationScale: seg.intonationScale,
              volumeScale: seg.volumeScale,
              prePhonemeLength: seg.prePhonemeLength,
              postPhonemeLength: seg.postPhonemeLength,
              pauseLengthScale: seg.pauseLengthScale,
              audioQuery: seg.audioQuery,
              accentPhrases: seg.audioQuery?.accent_phrases ?? seg.accentPhrases,
            }
          }),
          updatedAt: Date.now(),
        })

        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, viewUUID: stateKey, count: segments.length }) }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_resynthesize_for_player',
    {
      title: 'Resynthesize (Player)',
      description: 'Re-synthesize audio with a different speaker or updated parameters. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().optional().describe('Player instance ID to associate this synthesis with'),
        text: z.string().describe('Text to re-synthesize'),
        speaker: z.number().optional().describe('Speaker ID (uses server default if omitted)'),
        audioQuery: audioQuerySchema
          .optional()
          .describe('Audio query to synthesize from (preferred over text parameters)'),
        speedScale: z.number().optional().describe('Playback speed (uses server default if omitted)'),
        intonationScale: z.number().optional().describe('Intonation scale 抑揚 (optional)'),
        volumeScale: z.number().optional().describe('Volume scale 音量 (optional)'),
        prePhonemeLength: z.number().optional().describe('Pre-phoneme silence length in seconds (optional)'),
        postPhonemeLength: z.number().optional().describe('Post-phoneme silence length in seconds (optional)'),
        pauseLengthScale: z.number().optional().describe('Pause length scale between phrases 間の長さ (optional)'),
        accentPhrases: z.array(accentPhraseSchema).optional().describe('Accent phrases override'),
        autoPlay: z.boolean().optional().describe('Auto-play audio when loaded (uses server config if omitted)'),
        segmentIndex: z.number().int().min(0).optional().describe('Segment index for single-segment state update'),
        persistState: z.boolean().optional().describe('Persist player state to server store (default: true)'),
        segments: z
          .array(
            z.object({
              text: z.string(),
              speaker: z.number(),
              speedScale: z.number().optional(),
              intonationScale: z.number().optional(),
              volumeScale: z.number().optional(),
              prePhonemeLength: z.number().optional(),
              postPhonemeLength: z.number().optional(),
              pauseLengthScale: z.number().optional(),
              audioQuery: audioQuerySchema.optional(),
              accentPhrases: z.array(accentPhraseSchema).optional(),
            })
          )
          .optional()
          .describe('All current player segments — pass the full list to update server state'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (
      {
        viewUUID,
        text,
        speaker,
        audioQuery,
        speedScale,
        intonationScale,
        volumeScale,
        prePhonemeLength,
        postPhonemeLength,
        pauseLengthScale,
        accentPhrases,
        autoPlay,
        segmentIndex,
        persistState,
        segments,
      }: {
        viewUUID?: string
        text: string
        speaker?: number
        audioQuery?: AudioQuery
        speedScale?: number
        intonationScale?: number
        volumeScale?: number
        prePhonemeLength?: number
        postPhonemeLength?: number
        pauseLengthScale?: number
        accentPhrases?: AccentPhrase[]
        autoPlay?: boolean
        segmentIndex?: number
        persistState?: boolean
        segments?: Array<{
          text: string
          speaker: number
          speedScale?: number
          intonationScale?: number
          volumeScale?: number
          prePhonemeLength?: number
          postPhonemeLength?: number
          pauseLengthScale?: number
          audioQuery?: AudioQuery
          accentPhrases?: AccentPhrase[]
        }>
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const effectiveSpeed = speedScale ?? config.defaultSpeedScale
        const effectiveAutoPlay = autoPlay ?? config.autoPlay
        const shouldPersistState = persistState !== false
        const effectiveDefaultSpeaker = speaker ?? config.defaultSpeaker
        const stateKey = viewUUID ?? extra?.sessionId ?? 'global'

        if (segments && segments.length > 0 && shouldPersistState) {
          const list = await getSpeakerList()
          const speakerNameMap = new Map<number, string>()
          for (const speakerId of [...new Set(segments.map((seg) => seg.speaker ?? effectiveDefaultSpeaker))]) {
            const found = list.find((entry) => entry.id === speakerId)
            speakerNameMap.set(speakerId, found ? `${found.characterName}（${found.name}）` : `Speaker ${speakerId}`)
          }
          setSessionState(stateKey, {
            segments: segments.map((seg) => {
              const speakerId = seg.speaker ?? effectiveDefaultSpeaker
              return {
                text: seg.text,
                speaker: speakerId,
                speakerName: speakerNameMap.get(speakerId) ?? `Speaker ${speakerId}`,
                kana: seg.audioQuery?.kana,
                speedScale: seg.speedScale ?? effectiveSpeed,
                intonationScale: seg.intonationScale,
                volumeScale: seg.volumeScale,
                prePhonemeLength: seg.prePhonemeLength,
                postPhonemeLength: seg.postPhonemeLength,
                pauseLengthScale: seg.pauseLengthScale,
                audioQuery: seg.audioQuery,
                accentPhrases: seg.audioQuery?.accent_phrases ?? seg.accentPhrases,
              }
            }),
            updatedAt: Date.now(),
          })
        }

        const result = await synthesizeWithCache({
          text,
          speaker: effectiveDefaultSpeaker,
          audioQuery,
          speedScale: effectiveSpeed,
          intonationScale,
          volumeScale,
          prePhonemeLength,
          postPhonemeLength,
          pauseLengthScale,
          accentPhrases,
        })

        if (shouldPersistState && segmentIndex !== undefined) {
          const prev = getSessionState(stateKey)
          if (prev?.segments[segmentIndex]) {
            const nextSegments = prev.segments.slice()
            nextSegments[segmentIndex] = {
              ...nextSegments[segmentIndex],
              text: result.text,
              speaker: result.speaker,
              speakerName: result.speakerName,
              kana: result.kana,
              audioQuery: result.audioQuery,
              accentPhrases: result.accentPhrases,
              speedScale: result.speedScale,
              intonationScale: result.intonationScale,
              volumeScale: result.volumeScale,
              prePhonemeLength: result.prePhonemeLength,
              postPhonemeLength: result.postPhonemeLength,
              pauseLengthScale: result.pauseLengthScale,
            }
            setSessionState(stateKey, {
              segments: nextSegments,
              updatedAt: Date.now(),
            })
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                audioBase64: result.audioBase64,
                text: result.text,
                speaker: result.speaker,
                speakerName: result.speakerName,
                kana: result.kana,
                audioQuery: result.audioQuery,
                accentPhrases: result.accentPhrases,
                speedScale: result.speedScale,
                intonationScale: result.intonationScale,
                volumeScale: result.volumeScale,
                prePhonemeLength: result.prePhonemeLength,
                postPhonemeLength: result.postPhonemeLength,
                pauseLengthScale: result.pauseLengthScale,
                autoPlay: effectiveAutoPlay,
                viewUUID,
              }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

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

  // エクスポート可否を返す（不可ならUIボタンを非表示にする）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_export_capability_for_player',
    {
      title: 'Get Export Capability (Player)',
      description: 'Return whether track export + folder open is available for player UI.',
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (): Promise<CallToolResult> => {
      const canExport = config.playerExportEnabled
      const canChooseDirectory = canExport && canChooseDirectoryDialog()
      const canOpenDirectory = canExport && canOpenExplorer()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              available: canExport,
              canChooseDirectory,
              canOpenDirectory,
              defaultOutputDir: config.playerExportDir,
            }),
          },
        ],
      }
    }
  )

  // ユーザーの保存先ディレクトリ選択（OSのダイアログを開く）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_select_directory_for_player',
    {
      title: 'Select Export Directory (Player)',
      description: 'Open a native OS directory picker dialog, to be called from the player UI.',
      inputSchema: {
        defaultPath: z.string().optional().describe('Default directory path to show'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({ defaultPath }: { defaultPath?: string }): Promise<CallToolResult> => {
      try {
        const selected = await showDirectoryPicker(defaultPath || config.playerExportDir)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ path: selected }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // 現在のトラックをwavとして保存してフォルダを開く
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_export_tracks_for_player',
    {
      title: 'Export Tracks (Player)',
      description: 'Save player tracks as wav files and open the target folder in file explorer.',
      inputSchema: {
        outputDir: z.string().optional().describe('Output directory path (optional)'),
        segments: z
          .array(
            z.object({
              audioBase64: z.string().describe('WAV data in base64'),
              text: z.string().describe('Segment text'),
              speaker: z.number().describe('Speaker ID'),
              speakerName: z.string().describe('Speaker display name'),
            })
          )
          .describe('Tracks to export'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({
      outputDir,
      segments,
    }: {
      outputDir?: string
      segments: Array<{ audioBase64: string; text: string; speaker: number; speakerName: string }>
    }): Promise<CallToolResult> => {
      try {
        if (!config.playerExportEnabled) {
          throw new Error('Track export is disabled by VOICEVOX_PLAYER_EXPORT_ENABLED=false')
        }
        if (!segments || segments.length === 0) {
          throw new Error('No tracks to export')
        }

        // Normalize path to eliminate ../ traversal sequences before use
        const rawTarget = outputDir?.trim() || config.playerExportDir
        const targetDir = resolve(rawTarget)

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const sessionDir = join(targetDir, `voicevox-${timestamp}`)
        await mkdir(sessionDir, { recursive: true })

        const files: string[] = []
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          const indexPart = String(i + 1).padStart(2, '0')
          const speakerPart = sanitizeFilePart(seg.speakerName || `speaker-${seg.speaker}`, `speaker-${seg.speaker}`)
          const textPart = sanitizeFilePart(seg.text, `segment-${i + 1}`)
          const fileName = `${indexPart}-${speakerPart}-${textPart}.wav`
          const filePath = join(sessionDir, fileName)
          await writeFile(filePath, Buffer.from(seg.audioBase64, 'base64'))
          files.push(filePath)
        }

        let warning: string | undefined
        let openedDirectory = false

        if (canOpenExplorer()) {
          if (process.platform === 'win32') {
            // Windowsでのexplorer.exe呼び出しはClaude Desktop等の環境下で失敗しやすいため
            // spawnSync等を介さずに単に呼び出して結果を問わない形にする
            try {
              const child = spawn('explorer.exe', [sessionDir], { detached: true, stdio: 'ignore' })
              child.unref()
              openedDirectory = true
            } catch (e) {
              console.error('Failed to open explorer:', e)
              warning = `WAVファイルは保存されましたが、フォルダを開けませんでした: ${sessionDir}`
            }
          } else if (openDirectoryInExplorer(sessionDir)) {
            openedDirectory = true
          } else {
            warning = `WAVファイルは保存されましたが、フォルダを開けませんでした: ${sessionDir}`
          }
        } else {
          warning = `WAVファイルは保存されました。現在の環境ではフォルダ自動オープンに対応していません: ${sessionDir}`
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                outputDir: sessionDir,
                count: files.length,
                files,
                openedDirectory,
                warning,
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
