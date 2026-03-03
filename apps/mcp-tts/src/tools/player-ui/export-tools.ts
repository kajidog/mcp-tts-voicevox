import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerAppToolIfEnabled } from '../registration.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'
import {
  canChooseDirectoryDialog,
  canOpenExplorer,
  normalizeOutputDirectory,
  openDirectoryInExplorer,
  sanitizeFilePart,
  showDirectoryPicker,
} from './os-utils.js'

export function registerPlayerExportTools(context: PlayerUIToolContext): void {
  const { deps, shared } = context
  const { server, disabledTools, config } = deps
  const { playerResourceUri } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_export_capability_for_player',
    {
      title: 'Get Export Capability (Player)',
      description: 'Return whether track export + folder open is available for player UI.',
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (): Promise<CallToolResult> => {
      const canExport = config.playerExportEnabled
      const canChooseDirectory = canExport && canChooseDirectoryDialog()
      const canOpenDirectory = canExport && canOpenExplorer()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              available: canExport,
              canChooseDirectory,
              canOpenDirectory,
              defaultOutputDir: config.playerExportDir,
            }),
          },
        ],
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_select_directory_for_player',
    {
      title: 'Select Export Directory (Player)',
      description: 'Open a native OS directory picker dialog, to be called from the player UI.',
      inputSchema: {
        defaultPath: z.string().optional().describe('Default directory path to show'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({ defaultPath }: { defaultPath?: string }): Promise<CallToolResult> => {
      try {
        const selected = await showDirectoryPicker(defaultPath || config.playerExportDir)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ path: selected }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_export_tracks_for_player',
    {
      title: 'Export Tracks (Player)',
      description: 'Save player tracks as wav files and open the target folder in file explorer.',
      inputSchema: {
        outputDir: z.string().optional().describe('Output directory path (optional)'),
        segments: z
          .array(
            z.object({
              audioBase64: z.string().describe('WAV data in base64'),
              text: z.string().describe('Segment text'),
              speaker: z.number().describe('Speaker ID'),
              speakerName: z.string().describe('Speaker display name'),
            })
          )
          .describe('Tracks to export'),
      },
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async ({
      outputDir,
      segments,
    }: {
      outputDir?: string
      segments: Array<{ audioBase64: string; text: string; speaker: number; speakerName: string }>
    }): Promise<CallToolResult> => {
      try {
        if (!config.playerExportEnabled) {
          throw new Error('Track export is disabled by VOICEVOX_PLAYER_EXPORT_ENABLED=false')
        }
        if (!segments || segments.length === 0) {
          throw new Error('No tracks to export')
        }

        const rawTarget = outputDir?.trim() || config.playerExportDir
        const targetDir = normalizeOutputDirectory(rawTarget)

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const sessionDir = join(targetDir, `voicevox-${timestamp}`)
        await mkdir(sessionDir, { recursive: true })

        const files: string[] = []
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          const indexPart = String(i + 1).padStart(2, '0')
          const speakerPart = sanitizeFilePart(seg.speakerName || `speaker-${seg.speaker}`, `speaker-${seg.speaker}`)
          const textPart = sanitizeFilePart(seg.text, `segment-${i + 1}`)
          const fileName = `${indexPart}-${speakerPart}-${textPart}.wav`
          const filePath = join(sessionDir, fileName)
          await writeFile(filePath, Buffer.from(seg.audioBase64, 'base64'))
          files.push(filePath)
        }

        let warning: string | undefined
        let openedDirectory = false

        if (canOpenExplorer()) {
          if (process.platform === 'win32') {
            try {
              const child = spawn('explorer.exe', [sessionDir], { detached: true, stdio: 'ignore' })
              child.unref()
              openedDirectory = true
            } catch (e) {
              console.error('Failed to open explorer:', e)
              warning = `WAVファイルは保存されましたが、フォルダを開けませんでした: ${sessionDir}`
            }
          } else if (openDirectoryInExplorer(sessionDir)) {
            openedDirectory = true
          } else {
            warning = `WAVファイルは保存されましたが、フォルダを開けませんでした: ${sessionDir}`
          }
        } else {
          warning = `WAVファイルは保存されました。現在の環境ではフォルダ自動オープンに対応していません: ${sessionDir}`
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                outputDir: sessionDir,
                count: files.length,
                files,
                openedDirectory,
                warning,
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
