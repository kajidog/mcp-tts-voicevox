import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

// ホストは content テキスト以外（structuredContent / _meta）をUIへ転送しないため、
// ツール結果の解釈は content テキストとの契約に依存する。
// 契約元: apps/mcp-tts/src/tools/player/{speak,resynthesize}-player-tool.ts,
//         open-dictionary-ui-tool.ts

function getResultText(result: CallToolResult): string {
  const textContent = result.content?.find((c: { type: string }) => c.type === 'text')
  return textContent?.type === 'text' ? textContent.text : ''
}

/** speak_player / resynthesize_player の結果テキストから viewUUID を読み取る */
export function extractViewUUID(result: CallToolResult): string | null {
  const match = getResultText(result).match(/viewUUID: ([0-9a-fA-F-]{36})/)
  return match ? match[1] : null
}

/** open_dictionary_ui の結果かどうか判定する */
export function isDictionaryResult(result: CallToolResult): boolean {
  return getResultText(result).startsWith('Dictionary manager opened')
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
