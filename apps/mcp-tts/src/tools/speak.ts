import { type SpeakResult, VoicevoxApi, applyNotationAccents, parseNotation } from '@kajidog/voicevox-client'
import type { VoicevoxClient } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps, ToolHandlerExtra } from './types.js'
import {
  createErrorResponse,
  createSuccessResponse,
  formatSpeakResponse,
  getEffectiveSpeaker,
  processTextInput,
} from './utils.js'
/**
 * speak ツールの動的スキーマを構築
 */
export function buildSpeakInputSchema(restrictions: {
  immediate: boolean
  waitForStart: boolean
  waitForEnd: boolean
}) {
  const schema: Record<string, z.ZodType> = {
    text: z
      .string()
      .describe(
        'Text to speak. Lines (\\n) are queued separately -- keep the first line short for faster playback start. Per-line speaker prefix: "1:Hello\\n2:World".'
      ),
    phrases: z
      .string()
      .optional()
      .describe('Accent notation (e.g. "コン[ニ]チワ,セ[カ]イ"). Brackets mark accent nucleus. Overrides text.'),
    speaker: z.number().optional().describe('Speaker ID. Use get_speakers to list available IDs.'),
    speedScale: z.number().optional().describe('Playback speed multiplier (default: server config).'),
  }

  // 制限されていない場合のみスキーマに追加
  if (!restrictions.immediate) {
    schema.immediate = z
      .boolean()
      .optional()
      .describe('If true, interrupt current playback. If false, queue after current audio.')
  }

  if (!restrictions.waitForStart) {
    schema.waitForStart = z.boolean().optional().describe('Block until audio playback begins.')
  }

  if (!restrictions.waitForEnd) {
    schema.waitForEnd = z.boolean().optional().describe('Block until audio playback finishes.')
  }

  return schema
}

export function registerSpeakTool(deps: ToolDeps) {
  const { server, voicevoxClient, config, disabledTools, restrictions } = deps

  registerToolIfEnabled(
    server,
    disabledTools,
    'speak',
    {
      title: 'Speak',
      description:
        'Play text as speech through the system audio output. Each line is queued and played as a separate audio segment.',
      inputSchema: buildSpeakInputSchema(restrictions),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (
      {
        text,
        speaker,
        phrases,
        speedScale,
        immediate,
        waitForStart,
        waitForEnd,
      }: {
        text: string
        speaker?: number
        phrases?: string
        speedScale?: number
        immediate?: boolean
        waitForStart?: boolean
        waitForEnd?: boolean
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        // 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
        const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId)

        // 設定からデフォルトの再生オプションを取得
        const playbackOptions = {
          immediate: immediate ?? config.defaultImmediate,
          waitForStart: waitForStart ?? config.defaultWaitForStart,
          waitForEnd: waitForEnd ?? config.defaultWaitForEnd,
        }

        let result: SpeakResult

        if (phrases) {
          // phrases モード: インライン表記からアクセント指定付きで再生
          result = await processPhrasesInput(
            voicevoxClient,
            config.voicevoxUrl,
            phrases,
            effectiveSpeaker ?? config.defaultSpeaker,
            speedScale,
            playbackOptions
          )
        } else {
          result = await processTextInput(voicevoxClient, text, effectiveSpeaker, speedScale, playbackOptions)
        }

        return createSuccessResponse(formatSpeakResponse(result))
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

/**
 * インライン表記(phrases)からアクセント付き音声を生成して再生
 */
async function processPhrasesInput(
  voicevoxClient: VoicevoxClient,
  voicevoxUrl: string,
  phrases: string,
  speaker: number,
  speedScale?: number,
  playbackOptions?: {
    immediate?: boolean
    waitForStart?: boolean
    waitForEnd?: boolean
  }
): Promise<SpeakResult> {
  const api = new VoicevoxApi(voicevoxUrl)
  const parsedPhrases = parseNotation(phrases)
  if (parsedPhrases.length === 0) {
    throw new Error('phrases is empty')
  }

  // フレーズ境界が消えると accent phrase 数が崩れるため、読点で区切って結合する。
  const cleanText = parsedPhrases.map((p) => p.cleanText).join('、')
  const audioQuery = await voicevoxClient.generateQuery(cleanText, speaker, speedScale)

  // デフォルトのアクセント句を取得（brackets省略時のフォールバック用）
  const defaultAccentPhrases = audioQuery.accent_phrases

  // アクセントを適用
  audioQuery.accent_phrases = applyNotationAccents(parsedPhrases, audioQuery.accent_phrases, defaultAccentPhrases)

  // モーラデータを再計算（ピッチ値をアクセント変更に合わせて更新）
  audioQuery.accent_phrases = await api.updateMoraData(audioQuery.accent_phrases, speaker)

  return await voicevoxClient.enqueueAudioGeneration(audioQuery, {
    speaker,
    speedScale,
    ...playbackOptions,
  })
}
