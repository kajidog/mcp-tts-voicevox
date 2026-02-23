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
}

export function useExportTracks({
  app,
  exportCapability,
  isExporting,
  localSegments,
  setIsExporting,
}: UseExportTracksArgs) {
  return useCallback(
    async (chooseOutputDir: boolean) => {
      if (!exportCapability.available || isExporting || localSegments.length === 0) return

      let outputDir: string | undefined
      if (chooseOutputDir) {
        const input = window.prompt(
          '保存先ディレクトリを入力してください（空欄で既定）',
          exportCapability.defaultOutputDir ?? ''
        )
        if (input === null) return
        outputDir = input.trim() || undefined
      }

      setIsExporting(true)
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
          window.alert('保存できる音声トラックがありません。')
          return
        }

        await exportTracksOnServer(app, {
          outputDir,
          segments: exportSegments,
        })
      } catch (error) {
        console.error('Failed to export tracks:', error)
        window.alert('音声ファイルの保存に失敗しました。権限または保存先を確認してください。')
      } finally {
        setIsExporting(false)
      }
    },
    [app, exportCapability.available, exportCapability.defaultOutputDir, isExporting, localSegments, setIsExporting]
  )
}
