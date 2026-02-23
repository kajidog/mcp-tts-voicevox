import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AudioSegment } from '../types'
import { exportTracksOnServer, type ExportCapability } from './playerToolClient'

interface UseExportTracksArgs {
  app: App
  exportCapability: ExportCapability
  isExporting: boolean
  localSegments: AudioSegment[]
  setIsExporting: Dispatch<SetStateAction<boolean>>
  setExportError: Dispatch<SetStateAction<string | null>>
}

export function useExportTracks({
  app,
  exportCapability,
  isExporting,
  localSegments,
  setIsExporting,
  setExportError,
}: UseExportTracksArgs) {
  return useCallback(
    async (outputDir?: string) => {
      if (!exportCapability.available || isExporting || localSegments.length === 0) return

      setIsExporting(true)
      setExportError(null)
      try {
        const exportSegments = localSegments
          .filter((segment) => segment.audioBase64)
          .map((segment) => ({
            audioBase64: segment.audioBase64,
            text: segment.text,
            speaker: segment.speaker,
            speakerName: segment.speakerName,
          }))

        if (exportSegments.length === 0) {
          return
        }

        const result = await exportTracksOnServer(app, {
          outputDir: outputDir || undefined,
          segments: exportSegments,
        })
        if (typeof result?.warning === 'string' && result.warning.length > 0) {
          setExportError(result.warning)
        }
      } catch (error) {
        console.error('Failed to export tracks:', error)
        setExportError(`エクスポートに失敗しました:\n${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setIsExporting(false)
      }
    },
    [app, exportCapability.available, isExporting, localSegments, setIsExporting, setExportError]
  )
}
