import type { AccentPhrase, AudioQuery, VoicevoxApi } from '@kajidog/voicevox-client'

export type SynthesizeResult = {
  audioBase64: string
  text: string
  speaker: number
  speakerName: string
  kana?: string
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
  speedScale: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
}

export type SpeakerEntry = { id: number; name: string; characterName: string; uuid: string }

export type PlayerSegmentState = {
  text: string
  speaker: number
  speakerName?: string
  kana?: string
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
  speedScale: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
}

export type PlayerSessionState = {
  segments: PlayerSegmentState[]
  updatedAt: number
}

export interface PlayerUIShared {
  playerVoicevoxApi: VoicevoxApi
  playerResourceUri: string
  synthesizeWithCache: (input: {
    text: string
    speaker: number
    audioQuery?: AudioQuery
    speedScale: number
    intonationScale?: number
    volumeScale?: number
    prePhonemeLength?: number
    postPhonemeLength?: number
    pauseLengthScale?: number
    accentPhrases?: AccentPhrase[]
  }) => Promise<SynthesizeResult>
  setSessionState: (key: string, state: PlayerSessionState) => void
  getSessionState: (key: string) => PlayerSessionState | undefined
  getSpeakerList: () => Promise<SpeakerEntry[]>
}
