import { randomUUID } from 'node:crypto'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { isToolEnabled, registerAppToolIfEnabled } from '../registration.js'
import type { ToolDeps, ToolHandlerExtra } from '../types.js'
import { createErrorResponse, getEffectiveSpeaker, parseStringInput } from '../utils.js'
import type { PlayerRuntime } from './runtime.js'
import { playerResourceUri } from './runtime.js'

export function registerSpeakPlayerTool(deps: ToolDeps, runtime: PlayerRuntime): void {
  const { server, config, disabledTools } = deps

  registerAppToolIfEnabled(
    server,
    disabledTools,
    'speak_player',
    {
      title: 'Speak Player',
      description:
        'Use when you need a player UI (display, edit, or replay audio). Creates a VOICEVOX player session, returns viewUUID. Multi-speaker format: "1:Hello\\n2:World".' +
        (isToolEnabled(disabledTools, 'speak') ? ' For simple playback without UI, use voicevox_speak instead.' : ''),
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

        const effectiveSpeaker = getEffectiveSpeaker(speaker, extra) ?? config.defaultSpeaker
        const effectiveSpeed = speedScale ?? config.defaultSpeedScale

        const baseSegments = parsedSegments.map((s) => ({
          text: s.text,
          speaker: s.speaker ?? effectiveSpeaker,
          speedScale: effectiveSpeed,
        }))
        const speakerNameMap = await runtime.resolveSpeakerNames(baseSegments.map((s) => s.speaker))
        const viewUUID = randomUUID()

        const nextState = {
          segments: baseSegments.map((s) => ({
            text: s.text,
            speaker: s.speaker,
            speakerName: speakerNameMap.get(s.speaker),
            speedScale: s.speedScale,
          })),
          updatedAt: Date.now(),
          autoPlay: config.autoPlay,
        }
        runtime.setSessionState(viewUUID, nextState)
        if (extra.sessionId && extra.sessionId !== viewUUID) {
          runtime.setSessionState(extra.sessionId, nextState)
        }

        const fullText = parsedSegments.map((s) => s.text).join(' ')
        const textPreview = fullText.slice(0, 60) + (fullText.length > 60 ? '...' : '')
        const nextSteps = [
          ...(isToolEnabled(disabledTools, 'resynthesize_player')
            ? ['voicevox_resynthesize_player (edit a track)']
            : []),
          ...(isToolEnabled(disabledTools, 'get_player_state') ? ['voicevox_get_player_state (inspect state)'] : []),
        ]
        // 「viewUUID: <uuid>」はプレーヤーUIとの契約。ホストは content テキスト
        // 以外（structuredContent / _meta）をUIへ転送しないため、UIはこのテキスト
        // から viewUUID を読み取り _get_player_state_for_player で状態を取得する。
        return {
          content: [
            {
              type: 'text',
              text:
                `Voicevox Player started. viewUUID: ${viewUUID} 「${textPreview}」` +
                (nextSteps.length > 0 ? `\nNext: ${nextSteps.join(' | ')}` : ''),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
