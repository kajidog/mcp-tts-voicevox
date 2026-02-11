import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { MultiPlayerData, PlayerData } from './types'

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
      speedScale: data.speedScale,
    }
  } catch {
    return null
  }
}

export function extractMultiPlayerData(result: CallToolResult): MultiPlayerData | null {
  const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') return null

  try {
    const data = JSON.parse(textContent.text)
    if (!data.segments || !Array.isArray(data.segments)) return null
    return {
      segments: data.segments,
      autoPlay: data.autoPlay !== false,
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
