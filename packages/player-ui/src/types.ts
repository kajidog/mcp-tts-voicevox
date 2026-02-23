/** ツール結果から情報を抽出 */
export interface PlayerData {
  audioBase64: string
  text: string
  autoPlay: boolean
  speaker: number
  speakerName: string
  kana?: string
  speedScale?: number
  audioQuery?: AudioQuery
}

export interface SpeakerInfo {
  id: number
  name: string
  characterName: string
  uuid: string
}

export interface Mora {
  text: string
  consonant?: string
  consonant_length?: number
  vowel: string
  vowel_length: number
  pitch: number
}

export interface AccentPhrase {
  moras: Mora[]
  accent: number
  pause_mora?: Mora
  is_interrogative?: boolean
}

export interface AudioQuery {
  accent_phrases: AccentPhrase[]
  speedScale: number
  pitchScale: number
  intonationScale: number
  volumeScale: number
  prePhonemeLength: number
  postPhonemeLength: number
  outputSamplingRate: number
  outputStereo: boolean
  kana?: string
  pauseLengthScale?: number
}

/** マルチスピーカー用セグメント */
export interface AudioSegment {
  audioBase64?: string // speak_player 非同期化により初期は未設定、_resynthesize_for_player で取得
  text: string
  speaker: number
  speakerName?: string // speaker ID から導出可能なため省略可
  kana?: string
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
  speedScale?: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
}

/** マルチスピーカー用データ */
export interface MultiPlayerData {
  segments: AudioSegment[]
  autoPlay: boolean
  viewUUID?: string
}

export interface DictionaryWord {
  wordUuid: string
  surface: string
  pronunciation: string
  accentType: number
  priority: number
}

export interface DictionaryData {
  words: DictionaryWord[]
  notice?: string
}
