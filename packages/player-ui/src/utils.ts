import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { DictionaryData, MultiPlayerData, PlayerData } from './types'

export function extractPlayerData(result: CallToolResult): PlayerData | null {
  const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') return null

  try {
    const data = JSON.parse(textContent.text)
    if (!data.audioBase64) return null
    return {
      audioBase64: data.audioBase64,
      text: data.text || '',
      autoPlay: data.autoPlay !== false,
      speaker: data.speaker ?? 0,
      speakerName: data.speakerName || `Speaker ${data.speaker}`,
      kana: typeof data.kana === 'string' ? data.kana : undefined,
      speedScale: data.speedScale,
      audioQuery: typeof data.audioQuery === 'object' && data.audioQuery ? data.audioQuery : undefined,
    }
  } catch {
    return null
  }
}

export function extractMultiPlayerData(result: CallToolResult): MultiPlayerData | null {
  // content からセグメント配列を試みる（後方互換）
  const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
  if (textContent?.type === 'text') {
    try {
      const data = JSON.parse(textContent.text)
      if (data.segments && Array.isArray(data.segments)) {
        return {
          segments: data.segments,
          autoPlay: data.autoPlay !== false,
          viewUUID: typeof data.viewUUID === 'string' ? data.viewUUID : undefined,
        }
      }
    } catch {
      // JSON でない場合（例: "Voicevox Player started. ..."）は _meta にフォールバック
    }
  }

  // _meta からセグメント配列を読む（speak_player / resynthesize_player の新形式）
  const meta = (result as { _meta?: Record<string, unknown> })?._meta
  if (meta?.segments && Array.isArray(meta.segments)) {
    return {
      segments: meta.segments as MultiPlayerData['segments'],
      autoPlay: meta.autoPlay !== false,
      viewUUID: typeof meta.viewUUID === 'string' ? meta.viewUUID : undefined,
    }
  }

  return null
}

export function extractDictionaryData(result: CallToolResult): DictionaryData | null {
  const meta = (result as { _meta?: Record<string, unknown> })?._meta
  if (meta?.mode === 'dictionary' && Array.isArray(meta.dictionaryWords)) {
    return {
      words: meta.dictionaryWords as DictionaryData['words'],
      notice: typeof meta.dictionaryNotice === 'string' ? meta.dictionaryNotice : undefined,
    }
  }

  const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
  if (textContent?.type !== 'text') return null

  try {
    const data = JSON.parse(textContent.text) as { words?: DictionaryData['words']; notice?: string }
    if (!Array.isArray(data.words)) return null
    return {
      words: data.words,
      notice: typeof data.notice === 'string' ? data.notice : undefined,
    }
  } catch {
    return null
  }
}

/** 秒を mm:ss 形式に変換 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** speak_player テキスト入力をパース（マルチスピーカー形式検出） */
export function parseStringInput(input: string): Array<{ text: string; speaker?: number }> {
  const normalizedInput = input.replace(/\\n/g, '\n')
  const lines = normalizedInput.split('\n').filter((line) => line.trim())
  return lines.map((line) => {
    const match = line.match(/^(\d+):(.*)$/)
    if (match) {
      return { text: match[2].trim(), speaker: Number.parseInt(match[1], 10) }
    }
    return { text: line }
  })
}

/** マルチスピーカーテキストかどうか判定 */
export function isMultiSpeakerText(input: string): boolean {
  const segments = parseStringInput(input)
  if (segments.length < 2) return false
  // 複数行で、かつ少なくとも2つの異なるスピーカーIDがある場合
  const speakerIds = new Set(segments.filter((s) => s.speaker !== undefined).map((s) => s.speaker))
  return speakerIds.size >= 2
}
