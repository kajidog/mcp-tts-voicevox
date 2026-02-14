import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VoicevoxApi } from '@kajidog/voicevox-client'
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerAppToolIfEnabled } from './registration.js'
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

  // Speaker icon cache
  const speakerIconCache = new Map<string, string>()

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

  // speak_player ツール（UIプレイヤー付き）
  registerAppToolIfEnabled(
    server,
    disabledTools,
    'speak_player',
    {
      title: 'Speak Player',
      description:
        'Convert text to speech and display an audio player in the UI. Audio is played in the browser, not on the server. Does not use the playback queue. Supports multi-speaker dialogue: prefix each line with speaker ID like "1:Hello\\n2:World".',
      inputSchema: {
        text: z
          .string()
          .describe(
            'Text to convert to speech. Supports multi-speaker dialogue format with speaker ID prefix per line: "1:Hello\\n2:World". Each line is synthesized with the specified speaker and played sequentially.'
          ),
        speaker: z.number().optional().describe('Speaker ID (optional)'),
        speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
        autoPlay: z.boolean().optional().describe('Auto-play audio when loaded (default: true)'),
      },
      annotations: {
        readOnlyHint: true,
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
        autoPlay,
      }: {
        text: string
        speaker?: number
        speedScale?: number
        autoPlay?: boolean
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId) ?? config.defaultSpeaker
        const speed = speedScale ?? config.defaultSpeedScale

        // テキストをパース（バリデーションのみ）
        const segments = parseStringInput(text)
        const firstSegment = segments[0]
        if (!firstSegment) {
          throw new Error('Text is empty')
        }

        const speakerId = firstSegment.speaker ?? effectiveSpeaker
        const speakerName = await getSpeakerName(speakerId)
        const fullText = segments.map((s) => s.text).join(' ')

        // 音声合成はここでは行わず、UI側から _resynthesize_for_player を呼んでもらう
        // ここでは完了通知のみ返す
        // viewUUID: アプリ再起動時の復元検出に使用（公式パターン）

        return {
          content: [
            {
              type: 'text',
              text: `Voicevox Player started: ${speakerName} 「${fullText.slice(0, 50)}${fullText.length > 50 ? '...' : ''}」`,
            },
          ],
          _meta: { viewUUID: randomUUID() },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  // UI専用ツール: スピーカー一覧取得（UIからcallServerToolで呼ぶ用）
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

  // UI専用ツール: スピーカーアイコン取得
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
        // キャッシュチェック
        const cached = speakerIconCache.get(speakerUuid)
        if (cached) {
          return { content: [{ type: 'text', text: JSON.stringify({ portrait: cached }) }] }
        }

        const info = await playerVoicevoxApi.getSpeakerInfo(speakerUuid)
        const portrait = (info as any).portrait as string | undefined
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

  // UI専用ツール: スピーカーを変更して再合成
  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_resynthesize_for_player',
    {
      title: 'Resynthesize (Player)',
      description: 'Re-synthesize audio with a different speaker. Only callable from the app UI.',
      inputSchema: {
        text: z.string().describe('Text to re-synthesize'),
        speaker: z.number().optional().describe('Speaker ID (uses server default if omitted)'),
        speedScale: z.number().optional().describe('Playback speed (uses server default if omitted)'),
        autoPlay: z.boolean().optional().describe('Auto-play audio when loaded (uses server config if omitted)'),
        segments: z
          .array(
            z.object({
              text: z.string(),
              speaker: z.number(),
            })
          )
          .optional()
          .describe('Multi-speaker segments to synthesize individually'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({
      text,
      speaker,
      speedScale,
      autoPlay,
      segments,
    }: {
      text: string
      speaker?: number
      speedScale?: number
      autoPlay?: boolean
      segments?: Array<{ text: string; speaker: number }>
    }): Promise<CallToolResult> => {
      try {
        const effectiveSpeed = speedScale ?? config.defaultSpeedScale
        const effectiveAutoPlay = autoPlay ?? config.autoPlay
        const effectiveDefaultSpeaker = speaker ?? config.defaultSpeaker

        // マルチスピーカーモード
        if (segments && segments.length > 0) {
          const results = await Promise.all(
            segments.map(async (seg) => {
              const segSpeaker = seg.speaker ?? effectiveDefaultSpeaker
              const audioQuery = await playerVoicevoxApi.generateQuery(seg.text, segSpeaker)
              audioQuery.speedScale = effectiveSpeed
              const audioData = await playerVoicevoxApi.synthesize(audioQuery, segSpeaker)
              const base64Audio = Buffer.from(audioData).toString('base64')
              const segSpeakerName = await getSpeakerName(segSpeaker)
              return {
                audioBase64: base64Audio,
                text: seg.text,
                speaker: segSpeaker,
                speakerName: segSpeakerName,
              }
            })
          )

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  segments: results,
                  autoPlay: effectiveAutoPlay,
                }),
              },
            ],
          }
        }

        // シングルスピーカーモード（既存の動作）
        const audioQuery = await playerVoicevoxApi.generateQuery(text, effectiveDefaultSpeaker)
        audioQuery.speedScale = effectiveSpeed
        const audioData = await playerVoicevoxApi.synthesize(audioQuery, effectiveDefaultSpeaker)
        const base64Audio = Buffer.from(audioData).toString('base64')
        const speakerName = await getSpeakerName(effectiveDefaultSpeaker)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                audioBase64: base64Audio,
                text,
                speaker: effectiveDefaultSpeaker,
                speakerName,
                autoPlay: effectiveAutoPlay,
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
