/** ツール結果から情報を抽出 */
export interface PlayerData {
  audioBase64: string
  text: string
  autoPlay: boolean
  speaker: number
  speakerName: string
  speedScale?: number
}

export interface SpeakerInfo {
  id: number
  name: string
  characterName: string
  uuid: string
}

/** マルチスピーカー用セグメント */
export interface AudioSegment {
  audioBase64: string
  text: string
  speaker: number
  speakerName: string
}

/** マルチスピーカー用データ */
export interface MultiPlayerData {
  segments: AudioSegment[]
  autoPlay: boolean
}
