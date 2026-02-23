import type { App } from '@modelcontextprotocol/ext-apps'
import type { AccentPhrase, AudioQuery, AudioSegment, DictionaryWord, SpeakerInfo } from '../types'

interface TextContent {
  type: 'text'
  text: string
}

export interface ExportCapability {
  available: boolean
  defaultOutputDir?: string
}

export interface ResynthesizedSegment {
  audioBase64: string
  text?: string
  speaker?: number
  speakerName?: string
  kana?: string
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
  speedScale?: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
  viewUUID?: string
}

function getTextPayload(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  const textContent = content.find((c) => (c as { type?: string }).type === 'text') as
    | TextContent
    | undefined
  return textContent?.type === 'text' ? textContent.text : null
}

function assertNoToolError(result: { isError?: boolean; content?: unknown }): void {
  if (!result.isError) return
  const payload = getTextPayload(result.content)
  throw new Error(payload ?? 'Tool call failed')
}

export async function fetchSpeakersAndPortraits(app: App) {
  const result = await app.callServerTool({
    name: '_get_speakers_for_player',
    arguments: {},
  })
  const payload = getTextPayload(result.content)
  if (!payload) {
    return { speakers: [] as SpeakerInfo[], portraits: {} as Record<string, string> }
  }

  const speakers = JSON.parse(payload) as SpeakerInfo[]
  const uuids = [...new Set(speakers.map((speaker) => speaker.uuid).filter(Boolean))]

  const portraitResults = await Promise.all(
    uuids.map(async (uuid) => {
      try {
        const response = await app.callServerTool({
          name: '_get_speaker_icon_for_player',
          arguments: { speakerUuid: uuid },
        })
        const portraitPayload = getTextPayload(response.content)
        if (!portraitPayload) return null

        const parsed = JSON.parse(portraitPayload) as { portrait?: string }
        if (typeof parsed.portrait !== 'string') return null
        return { uuid, portrait: parsed.portrait }
      } catch (error) {
        console.error(`Failed to load portrait for ${uuid}:`, error)
        return null
      }
    })
  )

  const portraits: Record<string, string> = {}
  for (const portraitResult of portraitResults) {
    if (portraitResult) portraits[portraitResult.uuid] = portraitResult.portrait
  }

  return { speakers, portraits }
}

export async function fetchExportCapability(app: App): Promise<ExportCapability> {
  const result = await app.callServerTool({
    name: '_get_export_capability_for_player',
    arguments: {},
  })
  const payload = getTextPayload(result.content)

  if (!payload) return { available: false }

  const parsed = JSON.parse(payload) as ExportCapability
  return {
    available: Boolean(parsed?.available),
    defaultOutputDir: typeof parsed?.defaultOutputDir === 'string' ? parsed.defaultOutputDir : undefined,
  }
}

export async function resynthesizeSegmentOnServer(
  app: App,
  args: {
    viewUUID?: string
    text: string
    speaker: number
    audioQuery?: AudioQuery
    speedScale?: number
    intonationScale?: number
    volumeScale?: number
    prePhonemeLength?: number
    postPhonemeLength?: number
    pauseLengthScale?: number
    accentPhrases?: AccentPhrase[]
    segmentIndex?: number
    persistState?: boolean
    segments?: Array<{
      text: string
      speaker: number
      audioQuery?: AudioQuery
      speedScale?: number
      intonationScale?: number
      volumeScale?: number
      prePhonemeLength?: number
      postPhonemeLength?: number
      pauseLengthScale?: number
      accentPhrases?: AccentPhrase[]
    }>
  }
): Promise<ResynthesizedSegment | null> {
  const result = await app.callServerTool({
    name: '_resynthesize_for_player',
    arguments: args,
  })
  assertNoToolError(result)
  const payload = getTextPayload(result.content)
  return payload ? (JSON.parse(payload) as ResynthesizedSegment) : null
}

export async function previewSegmentOnServer(
  app: App,
  args: {
    viewUUID?: string
    text: string
    speaker: number
    audioQuery?: AudioQuery
    speedScale?: number
    intonationScale?: number
    volumeScale?: number
    prePhonemeLength?: number
    postPhonemeLength?: number
    pauseLengthScale?: number
    accentPhrases?: AccentPhrase[]
  }
): Promise<ResynthesizedSegment | null> {
  return resynthesizeSegmentOnServer(app, {
    ...args,
    persistState: false,
  })
}

export async function savePlayerStateOnServer(
  app: App,
  args: {
    viewUUID?: string
    segments: Array<{
      text: string
      speaker: number
      audioQuery?: AudioQuery
      speedScale?: number
      intonationScale?: number
      volumeScale?: number
      prePhonemeLength?: number
      postPhonemeLength?: number
      pauseLengthScale?: number
      accentPhrases?: AccentPhrase[]
    }>
  }
): Promise<void> {
  const result = await app.callServerTool({
    name: '_save_player_state_for_player',
    arguments: args,
  })
  assertNoToolError(result)
}

export async function fetchPlayerStateOnServer(
  app: App,
  args: { viewUUID?: string }
): Promise<{ segments: AudioSegment[]; updatedAt: number } | null> {
  const collected: AudioSegment[] = []
  let cursor: number | undefined = 0
  let updatedAt = 0

  for (let page = 0; page < 20; page++) {
    const result = await app.callServerTool({
      name: 'get_player_state',
      arguments: {
        viewUUID: args.viewUUID,
        cursor,
        limit: 100,
      },
    })
    const payload = getTextPayload(result.content)
    if (!payload) break
    const parsed = JSON.parse(payload) as {
      segments?: AudioSegment[]
      updatedAt?: number
      hasMore?: boolean
      nextCursor?: number | null
    }
    if (Array.isArray(parsed.segments)) collected.push(...parsed.segments)
    if (typeof parsed.updatedAt === 'number') updatedAt = parsed.updatedAt
    if (!parsed.hasMore || parsed.nextCursor === null || parsed.nextCursor === undefined) break
    cursor = parsed.nextCursor
  }

  if (collected.length === 0) return null
  return { segments: collected, updatedAt }
}

export async function exportTracksOnServer(
  app: App,
  args: {
    outputDir?: string
    segments: Array<Pick<AudioSegment, 'audioBase64' | 'text' | 'speaker' | 'speakerName'>>
  }
) {
  const result = await app.callServerTool({
    name: '_export_tracks_for_player',
    arguments: args,
  })
  assertNoToolError(result)
}

function extractDictionaryWords(payload: string | null): DictionaryWord[] {
  if (!payload) return []
  const parsed = JSON.parse(payload) as { words?: DictionaryWord[] }
  return Array.isArray(parsed.words) ? parsed.words : []
}

export async function fetchDictionaryWords(app: App): Promise<DictionaryWord[]> {
  const result = await app.callServerTool({
    name: '_get_user_dictionary_for_player',
    arguments: {},
  })
  assertNoToolError(result)
  return extractDictionaryWords(getTextPayload(result.content))
}

export async function addDictionaryWord(
  app: App,
  args: { surface: string; pronunciation: string; priority: number }
): Promise<DictionaryWord[]> {
  const result = await app.callServerTool({
    name: '_add_user_dictionary_word_for_player',
    arguments: args,
  })
  assertNoToolError(result)
  return extractDictionaryWords(getTextPayload(result.content))
}

export async function updateDictionaryWord(
  app: App,
  args: { wordUuid: string; surface: string; pronunciation: string; priority: number }
): Promise<DictionaryWord[]> {
  const result = await app.callServerTool({
    name: '_update_user_dictionary_word_for_player',
    arguments: args,
  })
  assertNoToolError(result)
  return extractDictionaryWords(getTextPayload(result.content))
}

export async function deleteDictionaryWord(app: App, args: { wordUuid: string }): Promise<DictionaryWord[]> {
  const result = await app.callServerTool({
    name: '_delete_user_dictionary_word_for_player',
    arguments: args,
  })
  assertNoToolError(result)
  return extractDictionaryWords(getTextPayload(result.content))
}

export async function previewDictionaryWord(
  app: App,
  args: { text: string }
): Promise<{ audioBase64: string; speakerName?: string; kana?: string } | null> {
  const result = await app.callServerTool({
    name: '_preview_dictionary_word_for_player',
    arguments: args,
  })
  assertNoToolError(result)
  const payload = getTextPayload(result.content)
  if (!payload) return null
  const parsed = JSON.parse(payload) as { audioBase64?: string; speakerName?: string; kana?: string }
  if (!parsed.audioBase64) return null
  return {
    audioBase64: parsed.audioBase64,
    speakerName: parsed.speakerName,
    kana: parsed.kana,
  }
}
