import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VoicevoxApi } from '@kajidog/voicevox-client'
import type { AccentPhrase, AudioQuery, Mora } from '@kajidog/voicevox-client'
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerPlayerUITools } from './player-ui-tools.js'
import { registerAppToolIfEnabled, registerToolIfEnabled } from './registration.js'
import type { ToolDeps, ToolHandlerExtra } from './types.js'
import { createErrorResponse, getEffectiveSpeaker, parseStringInput } from './utils.js'

const __dirname =
  typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url))

let playerHtml: string
try {
  // bundled: dist/mcp-app.html（tsupのonSuccessでコピー済み）
  const htmlPath = join(__dirname, 'mcp-app.html')
  playerHtml = readFileSync(htmlPath, 'utf-8')
} catch {
  try {
    // dev: tools/ ディレクトリからの相対パス（../../node_modules/...）
    const htmlPath = join(__dirname, '..', '..', 'node_modules', '@kajidog', 'player-ui', 'dist', 'mcp-app.html')
    playerHtml = readFileSync(htmlPath, 'utf-8')
  } catch {
    console.error('Warning: player-ui HTML not found. Please build @kajidog/player-ui first.')
    playerHtml = '<html><body><p>Player UI not available. Please build @kajidog/player-ui.</p></body></html>'
  }
}

const playerResourceUri = 'ui://speak-player/player.html'

let speakerCache: Array<{ id: number; name: string; characterName: string; uuid: string }> | null = null
const audioCacheDir = process.env.VOICEVOX_PLAYER_CACHE_DIR || join(process.cwd(), '.voicevox-player-cache')
const audioCacheMem = new Map<string, string>()
try {
  mkdirSync(audioCacheDir, { recursive: true })
} catch (error) {
  console.warn('Warning: failed to create VOICEVOX player cache directory:', error)
}

// ---------------------------------------------------------------------------
// Player session state types and store
// ---------------------------------------------------------------------------

interface PlayerSegmentState {
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
}

interface PlayerSessionState {
  segments: PlayerSegmentState[]
  updatedAt: number
}

const playerSessionState = new Map<string, PlayerSessionState>()
const MAX_TOOL_CONTENT_BYTES = 1024 * 1024
const DEFAULT_STATE_PAGE_LIMIT = 100
const MAX_STATE_PAGE_LIMIT = 1000
const MAX_PERSISTED_STATES = 500
const MAX_STATE_AGE_MS = 30 * 24 * 60 * 60 * 1000
const stateFilePath = process.env.VOICEVOX_PLAYER_STATE_FILE || join(audioCacheDir, 'player-state.json')
try {
  mkdirSync(dirname(stateFilePath), { recursive: true })
} catch (error) {
  console.warn('Warning: failed to prepare player state directory:', error)
}

function createAudioCacheKey(input: {
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
}): string {
  const keyInput = input.audioQuery
    ? JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        audioQuery: input.audioQuery,
      })
    : JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        speedScale: Number(input.speedScale.toFixed(4)),
        intonationScale: input.intonationScale === undefined ? null : Number(input.intonationScale.toFixed(4)),
        volumeScale: input.volumeScale === undefined ? null : Number(input.volumeScale.toFixed(4)),
        prePhonemeLength: input.prePhonemeLength === undefined ? null : Number(input.prePhonemeLength.toFixed(4)),
        postPhonemeLength: input.postPhonemeLength === undefined ? null : Number(input.postPhonemeLength.toFixed(4)),
        pauseLengthScale: input.pauseLengthScale === undefined ? null : Number(input.pauseLengthScale.toFixed(4)),
        accentPhrases: input.accentPhrases ?? null,
      })
  return createHash('sha256').update(keyInput).digest('hex')
}

function readCachedAudioBase64(cacheKey: string): string | null {
  const inMemory = audioCacheMem.get(cacheKey)
  if (inMemory) return inMemory

  const filePath = join(audioCacheDir, `${cacheKey}.txt`)
  try {
    const base64 = readFileSync(filePath, 'utf-8').trim()
    if (base64.length > 0) {
      audioCacheMem.set(cacheKey, base64)
      return base64
    }
  } catch {
    // cache miss
  }
  return null
}

async function writeCachedAudioBase64(cacheKey: string, base64: string): Promise<void> {
  audioCacheMem.set(cacheKey, base64)
  const filePath = join(audioCacheDir, `${cacheKey}.txt`)
  try {
    await writeFile(filePath, base64, 'utf-8')
  } catch (error) {
    console.warn('Warning: failed to write VOICEVOX player cache:', error)
  }
}

async function saveSessionStateToDisk(): Promise<void> {
  try {
    const now = Date.now()
    const validEntries = [...playerSessionState.entries()]
      .filter(([, state]) => now - state.updatedAt <= MAX_STATE_AGE_MS)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_PERSISTED_STATES)

    playerSessionState.clear()
    for (const [key, state] of validEntries) {
      playerSessionState.set(key, state)
    }

    const payload = JSON.stringify({
      version: 1,
      savedAt: now,
      entries: validEntries,
    })
    const tempPath = `${stateFilePath}.tmp`
    await writeFile(tempPath, payload, 'utf-8')
    await rename(tempPath, stateFilePath)
  } catch (error) {
    console.warn('Warning: failed to persist player state:', error)
  }
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleStateSave(): void {
  if (saveDebounceTimer !== null) clearTimeout(saveDebounceTimer)
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null
    saveSessionStateToDisk().catch((e) => console.warn('Warning: failed to persist player state:', e))
  }, 300)
}

function loadSessionStateFromDisk(): void {
  try {
    const raw = readFileSync(stateFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      entries?: Array<[string, PlayerSessionState]>
    }
    if (!Array.isArray(parsed.entries)) return

    const now = Date.now()
    for (const entry of parsed.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue
      const [key, state] = entry
      if (!key || typeof key !== 'string') continue
      if (!state || typeof state.updatedAt !== 'number' || !Array.isArray(state.segments)) continue
      if (now - state.updatedAt > MAX_STATE_AGE_MS) continue
      playerSessionState.set(key, state)
    }
  } catch {
    // 初回起動や破損時は空状態で継続
  }
}

function setSessionState(key: string, state: PlayerSessionState): void {
  playerSessionState.set(key, state)
  scheduleStateSave()
}

function getSessionState(viewUUID: string | undefined, sessionId: string | undefined): PlayerSessionState | undefined {
  // viewUUID が指定されていれば最優先で検索
  if (viewUUID) {
    const s = playerSessionState.get(viewUUID)
    if (s) return s
  }
  // sessionId でフォールバック
  const key = sessionId ?? 'global'
  const s = playerSessionState.get(key)
  if (s) return s
  return undefined
}

// ---------------------------------------------------------------------------

loadSessionStateFromDisk()

export function registerPlayerTools(deps: ToolDeps) {
  const { server, config, disabledTools } = deps
  const playerVoicevoxApi = new VoicevoxApi(config.voicevoxUrl)

  const getSpeakerList = async () => {
    if (speakerCache) return speakerCache
    try {
      const speakers = await playerVoicevoxApi.getSpeakers()
      speakerCache = speakers.flatMap((speaker: any) =>
        speaker.styles.map((style: any) => ({
          id: style.id,
          name: style.name,
          characterName: speaker.name,
          uuid: speaker.speaker_uuid,
        }))
      )
      return speakerCache
    } catch {
      return []
    }
  }

  const getSpeakerName = async (speakerId: number) => {
    const list = await getSpeakerList()
    const found = list?.find((s) => s.id === speakerId)
    return found ? `${found.characterName}（${found.name}）` : `Speaker ${speakerId}`
  }

  const resolveSpeakerNames = async (speakerIds: number[]) => {
    const uniqueSpeakerIds = [...new Set(speakerIds)]
    const entries = await Promise.all(uniqueSpeakerIds.map(async (id) => [id, await getSpeakerName(id)] as const))
    return new Map<number, string>(entries)
  }

  const getUserDictionaryWords = async () => {
    const dictionary = await playerVoicevoxApi.getUserDictionary()
    return Object.entries(dictionary).map(([wordUuid, word]) => ({
      wordUuid,
      surface: word.surface,
      pronunciation: word.pronunciation,
      accentType: word.accent_type,
      priority: word.priority,
    }))
  }

  const synthesizeWithCache = async ({
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
  }: {
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
  }) => {
    const speakerName = await getSpeakerName(speaker)

    // アクセント位置の変更をピッチに反映する
    // VOICEVOXの /synthesis は mora.pitch を直接使うため、
    // UIで accent 整数を変更しただけでは音が変わらない。
    // audioQuery と accentPhrases が両方渡された場合（UIでアクセント編集時）は
    // キャッシュキー計算の前に /mora_data でピッチを再計算する。
    // これによりキャッシュキーが正しいピッチ値に基づき、
    // 同じアクセント位置での2回目以降のプレビューがキャッシュヒットになる。
    let effectiveAudioQuery = audioQuery
    if (audioQuery && accentPhrases && accentPhrases.length > 0 && audioQuery.accent_phrases?.length > 0) {
      try {
        const updated = await playerVoicevoxApi.updateMoraData(audioQuery.accent_phrases as any, speaker)
        effectiveAudioQuery = { ...audioQuery, accent_phrases: updated }
      } catch (e) {
        console.warn('[synthesizeWithCache] /mora_data 再計算失敗、元のピッチ値を使用:', e)
      }
    }

    const cacheKey = createAudioCacheKey({
      text,
      speaker,
      audioQuery: effectiveAudioQuery,
      speedScale,
      intonationScale,
      volumeScale,
      prePhonemeLength,
      postPhonemeLength,
      pauseLengthScale,
      accentPhrases,
    })
    const cachedBase64 = readCachedAudioBase64(cacheKey)

    if (cachedBase64) {
      let cachedQuery = effectiveAudioQuery
      if (!cachedQuery) {
        // Cache hitでも UI の編集/復元で query が必要なため、メタデータ用 query を再構築する
        const generated = await playerVoicevoxApi.generateQuery(text, speaker)
        if (accentPhrases) generated.accent_phrases = accentPhrases as any
        generated.speedScale = speedScale
        if (intonationScale !== undefined) generated.intonationScale = intonationScale
        if (volumeScale !== undefined) generated.volumeScale = volumeScale
        if (prePhonemeLength !== undefined) generated.prePhonemeLength = prePhonemeLength
        if (postPhonemeLength !== undefined) generated.postPhonemeLength = postPhonemeLength
        if (pauseLengthScale !== undefined) generated.pauseLengthScale = pauseLengthScale
        cachedQuery = generated
      }
      return {
        audioBase64: cachedBase64,
        text,
        speaker,
        speakerName,
        kana: cachedQuery?.kana,
        audioQuery: cachedQuery,
        speedScale: cachedQuery?.speedScale ?? speedScale,
        intonationScale: cachedQuery?.intonationScale ?? intonationScale,
        volumeScale: cachedQuery?.volumeScale ?? volumeScale,
        prePhonemeLength: cachedQuery?.prePhonemeLength ?? prePhonemeLength,
        postPhonemeLength: cachedQuery?.postPhonemeLength ?? postPhonemeLength,
        pauseLengthScale: cachedQuery?.pauseLengthScale ?? pauseLengthScale,
        accentPhrases: (cachedQuery?.accent_phrases as AccentPhrase[] | undefined) ?? accentPhrases,
      }
    }

    const resolvedQuery = effectiveAudioQuery
      ? { ...effectiveAudioQuery }
      : await playerVoicevoxApi.generateQuery(text, speaker)
    if (!effectiveAudioQuery && accentPhrases) resolvedQuery.accent_phrases = accentPhrases as any
    if (!effectiveAudioQuery) {
      resolvedQuery.speedScale = speedScale
      if (intonationScale !== undefined) resolvedQuery.intonationScale = intonationScale
      if (volumeScale !== undefined) resolvedQuery.volumeScale = volumeScale
      if (prePhonemeLength !== undefined) resolvedQuery.prePhonemeLength = prePhonemeLength
      if (postPhonemeLength !== undefined) resolvedQuery.postPhonemeLength = postPhonemeLength
      if (pauseLengthScale !== undefined) resolvedQuery.pauseLengthScale = pauseLengthScale
    }

    const audioData = await playerVoicevoxApi.synthesize(resolvedQuery, speaker)
    const base64Audio = Buffer.from(audioData).toString('base64')
    await writeCachedAudioBase64(cacheKey, base64Audio)

    return {
      audioBase64: base64Audio,
      text,
      speaker,
      speakerName,
      kana: resolvedQuery.kana,
      audioQuery: resolvedQuery,
      accentPhrases: resolvedQuery.accent_phrases as AccentPhrase[] | undefined,
      speedScale: resolvedQuery.speedScale,
      intonationScale: resolvedQuery.intonationScale,
      volumeScale: resolvedQuery.volumeScale,
      prePhonemeLength: resolvedQuery.prePhonemeLength,
      postPhonemeLength: resolvedQuery.postPhonemeLength,
      pauseLengthScale: resolvedQuery.pauseLengthScale,
    }
  }

  // UIリソースの登録
  registerAppResource(
    server,
    'VOICEVOX Player',
    playerResourceUri,
    {
      description: 'Audio player UI for VOICEVOX TTS',
      mimeType: RESOURCE_MIME_TYPE,
    },
    async (): Promise<ReadResourceResult> => ({
      contents: [{ uri: playerResourceUri, mimeType: RESOURCE_MIME_TYPE, text: playerHtml }],
    })
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    'open_dictionary_ui',
    {
      title: 'Open Dictionary UI',
      description: 'Open the user dictionary manager UI for VOICEVOX.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: playerResourceUri } },
    },
    async (): Promise<CallToolResult> => {
      try {
        const words = await getUserDictionaryWords()
        const notice = '辞書変更は既存トラックに自動反映されません。Playerで再生成すると反映されます。'
        return {
          content: [{ type: 'text', text: `Dictionary manager opened. ${words.length} word(s).` }],
          _meta: {
            mode: 'dictionary',
            dictionaryWords: words,
            dictionaryNotice: notice,
          },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // speak_player ツール（UIプレイヤー付き）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    'speak_player',
    {
      title: 'Speak Player',
      description:
        'Create a VOICEVOX player session and display the UI. Returns viewUUID — save it and pass to resynthesize_player / get_player_state for subsequent operations. Multi-speaker format: "1:Hello\\n2:World". Audio synthesis is performed by the player UI when needed.',
      inputSchema: {
        text: z
          .string()
          .describe('Text to synthesize. Multi-speaker format: "1:Hello\\n2:World" (speaker ID prefix per line).'),
        speaker: z.number().optional().describe('Default speaker ID (optional)'),
        speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: playerResourceUri } },
    },
    async (
      {
        text,
        speaker,
        speedScale,
      }: {
        text: string
        speaker?: number
        speedScale?: number
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        if (!text?.trim()) {
          throw new Error('text is required')
        }

        const parsedSegments = parseStringInput(text)
        if (parsedSegments.length === 0) {
          throw new Error('Text is empty')
        }

        const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId) ?? config.defaultSpeaker
        const effectiveSpeed = speedScale ?? config.defaultSpeedScale

        const baseSegments = parsedSegments.map((s) => ({
          text: s.text,
          speaker: s.speaker ?? effectiveSpeaker,
          speedScale: effectiveSpeed,
        }))
        const speakerNameMap = await resolveSpeakerNames(baseSegments.map((s) => s.speaker))
        const viewUUID = randomUUID()

        setSessionState(viewUUID, {
          segments: baseSegments.map((s) => ({
            text: s.text,
            speaker: s.speaker,
            speakerName: speakerNameMap.get(s.speaker),
            speedScale: s.speedScale,
          })),
          updatedAt: Date.now(),
        })

        // content はAI向け最小情報のみ（1MB制限遵守）。
        // セグメント構造は _meta に格納してUIが利用する。
        const fullText = parsedSegments.map((s) => s.text).join(' ')
        const textPreview = fullText.slice(0, 60) + (fullText.length > 60 ? '...' : '')
        const uiSegments = baseSegments.map((s) => ({
          text: s.text,
          speaker: s.speaker,
          speakerName: speakerNameMap.get(s.speaker),
          speedScale: s.speedScale,
        }))
        return {
          content: [
            {
              type: 'text',
              text: `Voicevox Player started. viewUUID: ${viewUUID} 「${textPreview}」`,
            },
          ],
          _meta: {
            viewUUID,
            autoPlay: config.autoPlay,
            segments: uiSegments,
          },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // 公開ツール: セグメント単位で再合成（パラメータ調整用）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    'resynthesize_player',
    {
      title: 'Resynthesize Player',
      description:
        'Update player segments for a new player instance (new viewUUID every call). Typical loop: get_player_state (fetch additional pages if hasMore) -> edit segment parameters -> resynthesize_player -> use returned viewUUID for the next loop. Audio synthesis is performed by the player UI when needed.',
      inputSchema: {
        segments: z
          .array(
            z.object({
              text: z.string().describe('Segment text'),
              speaker: z.number().optional().describe('Speaker ID'),
              speedScale: z.number().optional().describe('Playback speed'),
              intonationScale: z.number().optional().describe('Intonation scale (抑揚)'),
              volumeScale: z.number().optional().describe('Volume scale (音量)'),
              prePhonemeLength: z.number().optional().describe('Pre-phoneme silence in seconds'),
              postPhonemeLength: z.number().optional().describe('Post-phoneme silence in seconds'),
              pauseLengthScale: z.number().optional().describe('Pause length scale between phrases (間の長さ)'),
              accentPhrases: z
                .array(
                  z.object({
                    moras: z.array(
                      z.object({
                        text: z.string(),
                        consonant: z.string().nullable().optional(),
                        consonant_length: z.number().nullable().optional(),
                        vowel: z.string(),
                        vowel_length: z.number(),
                        pitch: z.number(),
                      })
                    ),
                    accent: z.number().int(),
                    pause_mora: z
                      .object({
                        text: z.string(),
                        consonant: z.string().nullable().optional(),
                        consonant_length: z.number().nullable().optional(),
                        vowel: z.string(),
                        vowel_length: z.number(),
                        pitch: z.number(),
                      })
                      .nullable()
                      .optional(),
                    is_interrogative: z.boolean().nullable().optional(),
                  })
                )
                .optional()
                .describe('Accent phrases'),
            })
          )
          .describe(
            'Full segment list to update. Start from get_player_state.segments, edit needed fields, and send the complete array.'
          ),
        autoPlay: z.boolean().optional().describe('Auto-play when loaded (default: true)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: playerResourceUri } },
    },
    async (
      {
        segments,
        autoPlay,
      }: {
        segments: Array<{
          text: string
          speaker?: number
          speedScale?: number
          intonationScale?: number
          volumeScale?: number
          prePhonemeLength?: number
          postPhonemeLength?: number
          pauseLengthScale?: number
          accentPhrases?: AccentPhrase[]
        }>
        autoPlay?: boolean
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        if (!segments || segments.length === 0) {
          throw new Error('segments is required')
        }

        const effectiveDefaultSpeaker = getEffectiveSpeaker(undefined, extra.sessionId) ?? config.defaultSpeaker
        const effectiveSpeed = config.defaultSpeedScale
        const effectiveAutoPlay = autoPlay ?? config.autoPlay
        // 常に新しいUUIDを生成（MCPクライアント再起動時に同一UUIDのUIが重複表示されることを防ぐ）
        const viewUUID = randomUUID()
        const normalizedSegments = segments.map((seg) => ({
          text: seg.text,
          speaker: seg.speaker ?? effectiveDefaultSpeaker,
          speedScale: seg.speedScale ?? effectiveSpeed,
          intonationScale: seg.intonationScale,
          volumeScale: seg.volumeScale,
          prePhonemeLength: seg.prePhonemeLength,
          postPhonemeLength: seg.postPhonemeLength,
          pauseLengthScale: seg.pauseLengthScale,
          accentPhrases: seg.accentPhrases,
        }))
        const speakerNameMap = await resolveSpeakerNames(normalizedSegments.map((seg) => seg.speaker))

        setSessionState(viewUUID, {
          segments: normalizedSegments.map((seg) => ({
            text: seg.text,
            speaker: seg.speaker,
            speakerName: speakerNameMap.get(seg.speaker),
            speedScale: seg.speedScale,
            intonationScale: seg.intonationScale,
            volumeScale: seg.volumeScale,
            prePhonemeLength: seg.prePhonemeLength,
            postPhonemeLength: seg.postPhonemeLength,
            pauseLengthScale: seg.pauseLengthScale,
            accentPhrases: seg.accentPhrases,
          })),
          updatedAt: Date.now(),
        })

        const uiSegments = normalizedSegments.map((seg) => ({
          text: seg.text,
          speaker: seg.speaker,
          speakerName: speakerNameMap.get(seg.speaker),
          speedScale: seg.speedScale,
          intonationScale: seg.intonationScale,
          volumeScale: seg.volumeScale,
          prePhonemeLength: seg.prePhonemeLength,
          postPhonemeLength: seg.postPhonemeLength,
          pauseLengthScale: seg.pauseLengthScale,
          accentPhrases: seg.accentPhrases,
        }))
        return {
          content: [
            {
              type: 'text',
              text: `Voicevox Player updated. viewUUID: ${viewUUID} (${segments.length} segment(s))`,
            },
          ],
          _meta: {
            viewUUID,
            autoPlay: effectiveAutoPlay,
            segments: uiSegments,
          },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
  registerPlayerUITools(deps, {
    playerVoicevoxApi,
    playerResourceUri,
    synthesizeWithCache,
    setSessionState,
    getSessionState: (key) => playerSessionState.get(key),
    getSpeakerList,
  })
  // ---------------------------------------------------------------------------
  // 公開ツール: プレーヤー状態取得（AI微調整用・読み取り専用）
  // ---------------------------------------------------------------------------
  registerToolIfEnabled(
    server,
    disabledTools,
    'get_player_state',
    {
      title: 'Get VOICEVOX Player State',
      description:
        'Returns paged editable player state for AI tuning. Use the latest viewUUID from speak_player/resynthesize_player. If hasMore is true, call again with nextCursor to continue.',
      inputSchema: {
        viewUUID: z
          .string()
          .optional()
          .describe('Player instance ID from speak_player/resynthesize_player. Always pass the latest viewUUID.'),
        cursor: z.number().int().min(0).optional().describe('Start index in segments array (default: 0)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_STATE_PAGE_LIMIT)
          .optional()
          .describe(
            `Max segments per page (default: ${DEFAULT_STATE_PAGE_LIMIT}, max: ${MAX_STATE_PAGE_LIMIT}). Server may return fewer segments when needed.`
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (
      { viewUUID, cursor, limit }: { viewUUID?: string; cursor?: number; limit?: number },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const state = getSessionState(viewUUID, extra?.sessionId)
        if (!state) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  segments: [],
                  updatedAt: 0,
                  total: 0,
                  cursor: 0,
                  limit: limit ?? DEFAULT_STATE_PAGE_LIMIT,
                  hasMore: false,
                  nextCursor: null,
                  message: 'No player state available. Play something first.',
                }),
              },
            ],
          }
        }

        const total = state.segments.length
        const effectiveCursor = Math.min(cursor ?? 0, total)
        const requestedLimit = limit ?? DEFAULT_STATE_PAGE_LIMIT
        const effectiveLimit = Math.min(requestedLimit, MAX_STATE_PAGE_LIMIT)

        let pageEnd = Math.min(total, effectiveCursor + effectiveLimit)
        let pageSegments = state.segments.slice(effectiveCursor, pageEnd)

        const buildPayload = () => {
          const hasMore = pageEnd < total
          return {
            segments: pageSegments,
            updatedAt: state.updatedAt,
            total,
            cursor: effectiveCursor,
            limit: effectiveLimit,
            hasMore,
            nextCursor: hasMore ? pageEnd : null,
          }
        }

        let payload = buildPayload()
        let payloadText = JSON.stringify(payload)

        while (Buffer.byteLength(payloadText, 'utf8') > MAX_TOOL_CONTENT_BYTES && pageSegments.length > 0) {
          pageEnd -= 1
          pageSegments = state.segments.slice(effectiveCursor, pageEnd)
          payload = buildPayload()
          payloadText = JSON.stringify(payload)
        }

        if (Buffer.byteLength(payloadText, 'utf8') > MAX_TOOL_CONTENT_BYTES) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  segments: [],
                  updatedAt: state.updatedAt,
                  total,
                  cursor: effectiveCursor,
                  limit: effectiveLimit,
                  hasMore: effectiveCursor < total,
                  nextCursor: effectiveCursor < total ? effectiveCursor : null,
                  message:
                    'Player state is too large for this request. Request a later cursor or reduce source text size.',
                }),
              },
            ],
          }
        }

        if (pageSegments.length === 0 && effectiveCursor < total) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  segments: [],
                  updatedAt: state.updatedAt,
                  total,
                  cursor: effectiveCursor,
                  limit: effectiveLimit,
                  hasMore: true,
                  nextCursor: effectiveCursor,
                  message: 'Current segment is too large to include. Advance cursor or reduce segment text size.',
                }),
              },
            ],
          }
        }

        return {
          content: [{ type: 'text', text: payloadText }],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
