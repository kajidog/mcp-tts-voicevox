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
        'Open an interactive player UI for text-to-speech. Returns a viewUUID required by resynthesize_player and get_player_state. Audio is synthesized and played within the UI.',
      inputSchema: {
        text: z.string().describe('Text to speak. Per-line speaker prefix: "1:Hello\\n2:World".'),
        speaker: z.number().optional().describe('Default speaker ID.'),
        speedScale: z.number().optional().describe('Playback speed multiplier.'),
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
}
