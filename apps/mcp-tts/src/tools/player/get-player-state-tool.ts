import { type AccentPhrase, accentPhrasesToNotation } from '@kajidog/voicevox-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { registerToolIfEnabled } from '../registration.js'
import type { ToolDeps, ToolHandlerExtra } from '../types.js'
import { createErrorResponse } from '../utils.js'
import {
  DEFAULT_STATE_PAGE_LIMIT,
  MAX_STATE_PAGE_LIMIT,
  MAX_TOOL_CONTENT_BYTES,
  getSessionState,
} from './session-state.js'

export function registerGetPlayerStateTool(deps: ToolDeps): void {
  const { server, disabledTools } = deps

  registerToolIfEnabled(
    server,
    disabledTools,
    'get_player_state',
    {
      title: 'Get VOICEVOX Player State',
      description:
        'Returns paged player state with editable segments. Use latest viewUUID. If hasMore is true, call again with nextCursor.',
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

        // まずは要求件数でページを作り、サイズ超過時は後段で縮小する。
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
              phrases: rawAccentPhrases ? accentPhrasesToNotation(rawAccentPhrases) : undefined,
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
            ...(effectiveCursor === 0 && responseSegments.length > 0
              ? {
                  hint: 'To edit a track, call resynthesize_player with viewUUID + trackIndex. The "phrases" param uses inline notation: comma-separated phrases, [bracket] marks accent mora. Example: "コン[ニ]チワ,セ[カ]イ". Omit brackets to use VOICEVOX default accent. Omitted params keep existing values.',
                }
              : {}),
          }
        }

        let payload = buildPayload()
        let payloadText = JSON.stringify(payload)

        // MCPツール応答上限(1MB)を超える場合、末尾セグメントを削って収まるまで縮める。
        while (Buffer.byteLength(payloadText, 'utf8') > MAX_TOOL_CONTENT_BYTES && pageSegments.length > 0) {
          pageEnd -= 1
          pageSegments = state.segments.slice(effectiveCursor, pageEnd)
          payload = buildPayload()
          payloadText = JSON.stringify(payload)
        }

        if (Buffer.byteLength(payloadText, 'utf8') > MAX_TOOL_CONTENT_BYTES) {
          // 1件も返せないサイズなら、呼び出し側にカーソル調整を促す。
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
          // 単一セグメントが巨大なケース。次カーソルで再試行してもらう。
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
