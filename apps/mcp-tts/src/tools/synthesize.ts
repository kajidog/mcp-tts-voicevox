import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerToolIfEnabled } from './registration.js'
import type { ToolDeps, ToolHandlerExtra } from './types.js'
import { createErrorResponse, createSuccessResponse, getEffectiveSpeaker } from './utils.js'

export function registerSynthesizeTool(deps: ToolDeps) {
  const { server, voicevoxClient, disabledTools } = deps

  registerToolIfEnabled(
    server,
    disabledTools,
    'synthesize_file',
    {
      title: 'Synthesize File',
      description: 'Synthesize speech to a WAV file and return its absolute path. Does not play audio.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        text: z.string().describe('Text to synthesize.'),
        output: z.string().describe('Absolute file path for the output WAV.'),
        speaker: z.number().optional().describe('Speaker ID. Use get_speakers to list available IDs.'),
        speedScale: z.number().optional().describe('Playback speed multiplier (default: server config).'),
      },
    },
    async (
      {
        text,
        speaker,
        output,
        speedScale,
      }: {
        text: string
        speaker?: number
        output: string
        speedScale?: number
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        // 有効な話者IDを取得（優先順位: 明示的パラメータ > セッション設定 > グローバル設定）
        const effectiveSpeaker = getEffectiveSpeaker(speaker, extra.sessionId)

        const filePath = await voicevoxClient.generateAudioFile(text, output, effectiveSpeaker, speedScale)
        return createSuccessResponse(filePath)
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
