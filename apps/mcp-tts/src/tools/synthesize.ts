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
      description: 'Generate an audio file and return its absolute path',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        text: z.string().describe('Text for voice synthesis'),
        output: z.string().describe('Output path for the audio file'),
        speaker: z.number().optional().describe('Default speaker ID (optional)'),
        speedScale: z.number().optional().describe('Playback speed (optional, default from environment)'),
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
