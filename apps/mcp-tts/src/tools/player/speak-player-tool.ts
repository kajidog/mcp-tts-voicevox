import { randomUUID } from 'node:crypto'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerAppToolIfEnabled } from '../registration.js'
import type { ToolDeps, ToolHandlerExtra } from '../types.js'
import { createErrorResponse, getEffectiveSpeaker, parseStringInput } from '../utils.js'
import { playerResourceUri } from './runtime.js'
import type { PlayerRuntime } from './runtime.js'

export function registerSpeakPlayerTool(deps: ToolDeps, runtime: PlayerRuntime): void {
  const { server, config, disabledTools } = deps

  registerAppToolIfEnabled(
    server,
    disabledTools,
    'speak_player',
    {
      title: 'Speak Player',
      description:
        'Use when you need a player UI (display, edit, or replay audio). Creates a VOICEVOX player session, returns viewUUID. Multi-speaker format: "1:Hello\\n2:World". For simple playback without UI, use voicevox_speak instead.',
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
        }
        runtime.setSessionState(viewUUID, nextState)
        if (extra.sessionId && extra.sessionId !== viewUUID) {
          runtime.setSessionState(extra.sessionId, nextState)
        }

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
              text: `Voicevox Player started. viewUUID: ${viewUUID} 「${textPreview}」\nNext: voicevox_resynthesize_player (edit a track) | voicevox_get_player_state (inspect state)`,
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
}
