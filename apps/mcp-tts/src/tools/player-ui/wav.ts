/**
 * エクスポートされる音声データが本当に WAV かを検証する。
 *
 * `_export_tracks_for_player` は任意の MCP クライアントから呼べるため、
 * 受け取った base64 をそのまま `.wav` として書き出すと任意内容のファイル書き込みになる。
 * RIFF/WAVE ヘッダを確認し、違えば黙って読み飛ばさずエラーで拒否する。
 */

/** RIFF ヘッダ（"RIFF" + 4バイトサイズ + "WAVE"）の長さ */
const RIFF_HEADER_LENGTH = 12

export function isWavBuffer(buffer: Buffer): boolean {
  if (buffer.length < RIFF_HEADER_LENGTH) return false
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE'
}

/**
 * base64 文字列を WAV としてデコードする。
 *
 * @throws WAV ではなかった場合（どのセグメントが不正かを示すメッセージ）
 */
export function decodeWavBase64(audioBase64: string, label: string): Buffer {
  const buffer = Buffer.from(audioBase64, 'base64')
  if (!isWavBuffer(buffer)) {
    throw new Error(
      `Refused to export ${label}: the decoded audio is not a WAV file (missing RIFF/WAVE header). ` +
        'Only WAV audio produced by the VOICEVOX engine can be exported; re-synthesize the track and try again.'
    )
  }
  return buffer
}
