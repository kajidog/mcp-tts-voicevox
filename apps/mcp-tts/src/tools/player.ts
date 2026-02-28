import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VoicevoxApi } from '@kajidog/voicevox-client'
import type { AccentPhrase, AudioQuery } from '@kajidog/voicevox-client'
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import {
  createAudioCacheKey,
  getAudioCacheDir,
  initializeAudioCache,
  readCachedAudioBase64,
  writeCachedAudioBase64,
} from './player-audio-cache.js'
import { accentPhrasesToSimplifiedPhrases, applyAccentsToAccentPhrases } from './player-phrase-utils.js'
import {
  DEFAULT_STATE_PAGE_LIMIT,
  MAX_STATE_PAGE_LIMIT,
  MAX_TOOL_CONTENT_BYTES,
  getSessionState,
  getSessionStateByKey,
  initializeSessionState,
  setSessionState,
} from './player-session-state.js'
import type { PlayerSegmentState } from './player-session-state.js'
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
let playerStorageInitialized = false

// ---------------------------------------------------------------------------

function initializePlayerStorage(config: ToolDeps['config']): void {
  if (playerStorageInitialized) return
  playerStorageInitialized = true

  initializeAudioCache(config)
  initializeSessionState(config, getAudioCacheDir())
}

export function registerPlayerTools(deps: ToolDeps) {
  const { server, config, disabledTools } = deps
  initializePlayerStorage(config)
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
      contents: [
        {
          uri: playerResourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: playerHtml,
          _meta: {
            ui: {
              csp: {},
              ...(config.playerDomain ? { domain: config.playerDomain } : {}),
            },
          },
        },
      ],
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
          structuredContent: {
            mode: 'dictionary',
            dictionaryWords: words,
            dictionaryNotice: notice,
          },
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
          structuredContent: {
            viewUUID,
            autoPlay: config.autoPlay,
            segments: uiSegments,
          },
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

  // 公開ツール: 単一トラック更新（パラメータ調整用）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    'resynthesize_player',
    {
      title: 'Resynthesize Player',
      description:
        'Update a single player track by index. Pass viewUUID + trackIndex to identify the segment. Provide text to regenerate from scratch, or accents [number] to adjust accent positions only. Omitted parameters keep existing values. Returns new viewUUID for subsequent operations. Audio synthesis is performed by the player UI.',
      inputSchema: {
        viewUUID: z
          .string()
          .describe('Player instance ID from speak_player/resynthesize_player. Required to identify the session.'),
        trackIndex: z
          .number()
          .int()
          .min(0)
          .describe('Index of the segment to update (from get_player_state trackIndex).'),
        text: z
          .string()
          .optional()
          .describe(
            'New text for this segment. If provided, triggers full re-generation. Takes priority over accents.'
          ),
        accents: z
          .array(z.number().int().min(1))
          .optional()
          .describe(
            'Accent positions as a number array, one per phrase (position-based). Only used when text is not provided.'
          ),
        speaker: z.number().optional().describe('Speaker ID (omit to keep existing)'),
        speedScale: z.number().optional().describe('Playback speed (omit to keep existing)'),
        intonationScale: z.number().optional().describe('Intonation scale (omit to keep existing)'),
        volumeScale: z.number().optional().describe('Volume scale (omit to keep existing)'),
        prePhonemeLength: z.number().optional().describe('Pre-phoneme silence in seconds (omit to keep existing)'),
        postPhonemeLength: z.number().optional().describe('Post-phoneme silence in seconds (omit to keep existing)'),
        pauseLengthScale: z.number().optional().describe('Pause length scale (omit to keep existing)'),
        autoPlay: z.boolean().optional().describe('Auto-play when loaded (default from config)'),
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
        viewUUID: inputViewUUID,
        trackIndex,
        text,
        accents,
        speaker,
        speedScale,
        intonationScale,
        volumeScale,
        prePhonemeLength,
        postPhonemeLength,
        pauseLengthScale,
        autoPlay,
      }: {
        viewUUID: string
        trackIndex: number
        text?: string
        accents?: number[]
        speaker?: number
        speedScale?: number
        intonationScale?: number
        volumeScale?: number
        prePhonemeLength?: number
        postPhonemeLength?: number
        pauseLengthScale?: number
        autoPlay?: boolean
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const state = getSessionState(inputViewUUID, extra?.sessionId)
        if (!state) {
          throw new Error('No player state found for the given viewUUID. Use speak_player first.')
        }
        if (trackIndex < 0 || trackIndex >= state.segments.length) {
          throw new Error(`trackIndex ${trackIndex} is out of range. Valid range: 0-${state.segments.length - 1}`)
        }

        const existingSegment = state.segments[trackIndex]
        const effectiveDefaultSpeaker = getEffectiveSpeaker(undefined, extra.sessionId) ?? config.defaultSpeaker
        const effectiveAutoPlay = autoPlay ?? config.autoPlay

        // パラメータ優先順位: 指定値 > 既存セグメント値 > config デフォルト
        const effectiveSpeaker = speaker ?? existingSegment.speaker ?? effectiveDefaultSpeaker
        const effectiveSpeed = speedScale ?? existingSegment.speedScale ?? config.defaultSpeedScale
        const effectiveIntonation = intonationScale ?? existingSegment.intonationScale
        const effectiveVolume = volumeScale ?? existingSegment.volumeScale
        const effectivePrePhoneme = prePhonemeLength ?? existingSegment.prePhonemeLength
        const effectivePostPhoneme = postPhonemeLength ?? existingSegment.postPhonemeLength
        const effectivePauseLength = pauseLengthScale ?? existingSegment.pauseLengthScale

        let updatedAccentPhrases: AccentPhrase[] | undefined
        const textProvided = text !== undefined
        const effectiveText = textProvided ? text : existingSegment.text

        if (textProvided) {
          // テキスト変更 → 全再生成。accentsは無視。
          updatedAccentPhrases = undefined
        } else if (accents && accents.length > 0) {
          // アクセントのみ変更: 既存AccentPhraseにマージ
          const existingAccentPhrases =
            existingSegment.accentPhrases ?? (existingSegment.audioQuery?.accent_phrases as AccentPhrase[] | undefined)

          if (existingAccentPhrases && existingAccentPhrases.length > 0) {
            updatedAccentPhrases = applyAccentsToAccentPhrases(existingAccentPhrases, accents)
          } else {
            // 既存AccentPhraseがない場合、テキストからベース構造を生成してaccent適用
            const tempQuery = await playerVoicevoxApi.generateQuery(effectiveText, effectiveSpeaker)
            updatedAccentPhrases = applyAccentsToAccentPhrases(tempQuery.accent_phrases as AccentPhrase[], accents)
          }
        } else {
          // テキスト変更なし・アクセント変更なし → 既存パラメータで再合成
          updatedAccentPhrases =
            existingSegment.accentPhrases ?? (existingSegment.audioQuery?.accent_phrases as AccentPhrase[] | undefined)
        }

        // audioQueryの更新（テキスト変更なし + 既存audioQueryあり + AccentPhraseあり の場合）
        let audioQueryForState: AudioQuery | undefined
        if (!textProvided && existingSegment.audioQuery && updatedAccentPhrases) {
          audioQueryForState = {
            ...existingSegment.audioQuery,
            accent_phrases: updatedAccentPhrases,
            speedScale: effectiveSpeed,
            ...(effectiveIntonation !== undefined && { intonationScale: effectiveIntonation }),
            ...(effectiveVolume !== undefined && { volumeScale: effectiveVolume }),
            ...(effectivePrePhoneme !== undefined && { prePhonemeLength: effectivePrePhoneme }),
            ...(effectivePostPhoneme !== undefined && { postPhonemeLength: effectivePostPhoneme }),
            ...(effectivePauseLength !== undefined && { pauseLengthScale: effectivePauseLength }),
          }
        }

        // 新しいviewUUID生成（MCPクライアント再起動時に同一UUIDのUIが重複表示されることを防ぐ）
        const viewUUID = randomUUID()
        const speakerName = await getSpeakerName(effectiveSpeaker)

        // 更新されたセグメントを構築
        const updatedSegmentState: PlayerSegmentState = {
          text: effectiveText,
          speaker: effectiveSpeaker,
          speakerName,
          kana: textProvided ? undefined : existingSegment.kana,
          audioQuery: audioQueryForState ?? (textProvided ? undefined : existingSegment.audioQuery),
          accentPhrases: updatedAccentPhrases,
          speedScale: effectiveSpeed,
          intonationScale: effectiveIntonation,
          volumeScale: effectiveVolume,
          prePhonemeLength: effectivePrePhoneme,
          postPhonemeLength: effectivePostPhoneme,
          pauseLengthScale: effectivePauseLength,
        }

        // セグメント配列をコピーして対象トラックを差し替え
        const newSegments = state.segments.slice()
        newSegments[trackIndex] = updatedSegmentState

        // 全セグメントのスピーカー名を再解決
        const speakerNameMap = await resolveSpeakerNames(newSegments.map((s) => s.speaker))
        const enrichedSegments = newSegments.map((seg) => ({
          ...seg,
          speakerName: speakerNameMap.get(seg.speaker) ?? seg.speakerName,
        }))

        setSessionState(viewUUID, {
          segments: enrichedSegments,
          updatedAt: Date.now(),
        })

        // UIセグメント構築（structuredContent / _meta 用）
        const uiSegments = enrichedSegments.map((seg) => ({
          text: seg.text,
          speaker: seg.speaker,
          speakerName: seg.speakerName,
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
              text: `Voicevox Player updated track ${trackIndex}. viewUUID: ${viewUUID}`,
            },
          ],
          structuredContent: {
            viewUUID,
            autoPlay: effectiveAutoPlay,
            segments: uiSegments,
            resynthesizedTrackIndex: trackIndex,
          },
          _meta: {
            viewUUID,
            autoPlay: effectiveAutoPlay,
            segments: uiSegments,
            resynthesizedTrackIndex: trackIndex,
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
    getSessionState: (key) => getSessionStateByKey(key),
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
        'Returns paged player state for AI tuning. Each segment includes trackIndex and simplified phrases [{text, accent}]. Use the latest viewUUID from speak_player/resynthesize_player. If hasMore is true, call again with nextCursor to continue.',
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
          const responseSegments = pageSegments.map((seg, i) => {
            const rawAccentPhrases = seg.accentPhrases ?? (seg.audioQuery?.accent_phrases as AccentPhrase[] | undefined)
            return {
              trackIndex: effectiveCursor + i,
              text: seg.text,
              speaker: seg.speaker,
              speakerName: seg.speakerName,
              phrases: rawAccentPhrases ? accentPhrasesToSimplifiedPhrases(rawAccentPhrases) : null,
              speedScale: seg.speedScale,
              intonationScale: seg.intonationScale,
              volumeScale: seg.volumeScale,
              prePhonemeLength: seg.prePhonemeLength,
              postPhonemeLength: seg.postPhonemeLength,
              pauseLengthScale: seg.pauseLengthScale,
            }
          })
          return {
            segments: responseSegments,
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
