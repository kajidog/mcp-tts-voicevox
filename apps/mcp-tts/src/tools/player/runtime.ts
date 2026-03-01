import { VoicevoxApi } from '@kajidog/voicevox-client'
import type { AccentPhrase, AudioQuery } from '@kajidog/voicevox-client'
import type { ToolDeps } from '../types.js'
import {
  createAudioCacheKey,
  getAudioCacheDir,
  initializeAudioCache,
  readCachedAudioBase64,
  writeCachedAudioBase64,
} from './audio-cache.js'
import { initializeSessionState } from './session-state.js'

export const playerResourceUri = 'ui://speak-player/player.html'

type SpeakerEntry = { id: number; name: string; characterName: string; uuid: string }

type SynthesizeInput = {
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
}

type SynthesizeResult = {
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

export interface PlayerRuntime {
  playerVoicevoxApi: VoicevoxApi
  getSpeakerList: () => Promise<SpeakerEntry[]>
  getSpeakerName: (speakerId: number) => Promise<string>
  resolveSpeakerNames: (speakerIds: number[]) => Promise<Map<number, string>>
  getUserDictionaryWords: () => Promise<
    Array<{ wordUuid: string; surface: string; pronunciation: string; accentType: number; priority: number }>
  >
  synthesizeWithCache: (input: SynthesizeInput) => Promise<SynthesizeResult>
}

let speakerCache: SpeakerEntry[] | null = null
let playerStorageInitialized = false

function initializePlayerStorage(config: ToolDeps['config']): void {
  // セッションごとの再登録で初期化が多重実行されないようにする。
  if (playerStorageInitialized) return
  playerStorageInitialized = true
  initializeAudioCache(config)
  initializeSessionState(config, getAudioCacheDir())
}

export function createPlayerRuntime(deps: ToolDeps): PlayerRuntime {
  const { config } = deps
  initializePlayerStorage(config)
  const playerVoicevoxApi = new VoicevoxApi(config.voicevoxUrl)

  const getSpeakerList = async () => {
    // スピーカー一覧は変化が少ないためプロセス内キャッシュする。
    if (speakerCache) return speakerCache
    try {
      const speakers = await playerVoicevoxApi.getSpeakers()
      speakerCache = speakers.flatMap((speaker: any) =>
        speaker.styles.map((style: any) => ({
          id: style.id,
          name: style.name,
          characterName: speaker.name,
          uuid: speaker.speaker_uuid,
        }))
      )
      return speakerCache
    } catch {
      return []
    }
  }

  const getSpeakerName = async (speakerId: number) => {
    const list = await getSpeakerList()
    const found = list?.find((s) => s.id === speakerId)
    return found ? `${found.characterName}（${found.name}）` : `Speaker ${speakerId}`
  }

  const resolveSpeakerNames = async (speakerIds: number[]) => {
    const uniqueSpeakerIds = [...new Set(speakerIds)]
    const entries = await Promise.all(uniqueSpeakerIds.map(async (id) => [id, await getSpeakerName(id)] as const))
    return new Map<number, string>(entries)
  }

  const getUserDictionaryWords = async () => {
    const dictionary = await playerVoicevoxApi.getUserDictionary()
    return Object.entries(dictionary).map(([wordUuid, word]) => ({
      wordUuid,
      surface: word.surface,
      pronunciation: word.pronunciation,
      accentType: word.accent_type,
      priority: word.priority,
    }))
  }

  const synthesizeWithCache = async ({
    text,
    speaker,
    audioQuery,
    speedScale,
    intonationScale,
    volumeScale,
    prePhonemeLength,
    postPhonemeLength,
    pauseLengthScale,
    accentPhrases,
  }: SynthesizeInput): Promise<SynthesizeResult> => {
    const speakerName = await getSpeakerName(speaker)

    // アクセント編集時は /mora_data でピッチ再計算してからキャッシュキーを作る。
    // これにより、同じアクセント編集結果で正しくキャッシュヒットする。
    let effectiveAudioQuery = audioQuery
    if (audioQuery && accentPhrases && accentPhrases.length > 0 && audioQuery.accent_phrases?.length > 0) {
      try {
        const updated = await playerVoicevoxApi.updateMoraData(audioQuery.accent_phrases as any, speaker)
        effectiveAudioQuery = { ...audioQuery, accent_phrases: updated }
      } catch (e) {
        console.warn('[synthesizeWithCache] /mora_data 再計算失敗、元のピッチ値を使用:', e)
      }
    }

    const cacheKey = createAudioCacheKey({
      text,
      speaker,
      audioQuery: effectiveAudioQuery,
      speedScale,
      intonationScale,
      volumeScale,
      prePhonemeLength,
      postPhonemeLength,
      pauseLengthScale,
      accentPhrases,
    })
    const cachedBase64 = readCachedAudioBase64(cacheKey)

    if (cachedBase64) {
      // キャッシュヒット時でも、UI復元に必要な query メタデータは返す。
      let cachedQuery = effectiveAudioQuery
      if (!cachedQuery) {
        const generated = await playerVoicevoxApi.generateQuery(text, speaker)
        if (accentPhrases) generated.accent_phrases = accentPhrases as any
        generated.speedScale = speedScale
        if (intonationScale !== undefined) generated.intonationScale = intonationScale
        if (volumeScale !== undefined) generated.volumeScale = volumeScale
        if (prePhonemeLength !== undefined) generated.prePhonemeLength = prePhonemeLength
        if (postPhonemeLength !== undefined) generated.postPhonemeLength = postPhonemeLength
        if (pauseLengthScale !== undefined) generated.pauseLengthScale = pauseLengthScale
        cachedQuery = generated
      }
      return {
        audioBase64: cachedBase64,
        text,
        speaker,
        speakerName,
        kana: cachedQuery?.kana,
        audioQuery: cachedQuery,
        speedScale: cachedQuery?.speedScale ?? speedScale,
        intonationScale: cachedQuery?.intonationScale ?? intonationScale,
        volumeScale: cachedQuery?.volumeScale ?? volumeScale,
        prePhonemeLength: cachedQuery?.prePhonemeLength ?? prePhonemeLength,
        postPhonemeLength: cachedQuery?.postPhonemeLength ?? postPhonemeLength,
        pauseLengthScale: cachedQuery?.pauseLengthScale ?? pauseLengthScale,
        accentPhrases: (cachedQuery?.accent_phrases as AccentPhrase[] | undefined) ?? accentPhrases,
      }
    }

    const resolvedQuery = effectiveAudioQuery
      ? { ...effectiveAudioQuery }
      : await playerVoicevoxApi.generateQuery(text, speaker)
    // query 未指定時のみ、ツール引数の各パラメータを上書き適用する。
    if (!effectiveAudioQuery && accentPhrases) resolvedQuery.accent_phrases = accentPhrases as any
    if (!effectiveAudioQuery) {
      resolvedQuery.speedScale = speedScale
      if (intonationScale !== undefined) resolvedQuery.intonationScale = intonationScale
      if (volumeScale !== undefined) resolvedQuery.volumeScale = volumeScale
      if (prePhonemeLength !== undefined) resolvedQuery.prePhonemeLength = prePhonemeLength
      if (postPhonemeLength !== undefined) resolvedQuery.postPhonemeLength = postPhonemeLength
      if (pauseLengthScale !== undefined) resolvedQuery.pauseLengthScale = pauseLengthScale
    }

    const audioData = await playerVoicevoxApi.synthesize(resolvedQuery, speaker)
    const base64Audio = Buffer.from(audioData).toString('base64')
    await writeCachedAudioBase64(cacheKey, base64Audio)

    return {
      audioBase64: base64Audio,
      text,
      speaker,
      speakerName,
      kana: resolvedQuery.kana,
      audioQuery: resolvedQuery,
      accentPhrases: resolvedQuery.accent_phrases as AccentPhrase[] | undefined,
      speedScale: resolvedQuery.speedScale,
      intonationScale: resolvedQuery.intonationScale,
      volumeScale: resolvedQuery.volumeScale,
      prePhonemeLength: resolvedQuery.prePhonemeLength,
      postPhonemeLength: resolvedQuery.postPhonemeLength,
      pauseLengthScale: resolvedQuery.pauseLengthScale,
    }
  }

  return {
    playerVoicevoxApi,
    getSpeakerList,
    getSpeakerName,
    resolveSpeakerNames,
    getUserDictionaryWords,
    synthesizeWithCache,
  }
}
