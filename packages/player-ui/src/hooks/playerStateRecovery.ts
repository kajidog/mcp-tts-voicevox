import type { App } from '@modelcontextprotocol/ext-apps'
import type { AudioSegment } from '../types'
import { fetchPlayerStateOnServer } from './playerToolClient'

const playerSnapshotFullKey = (viewUUID: string) => `voicevox-player-state-full-${viewUUID}`
const playerSnapshotSlimKey = (viewUUID: string) => `voicevox-player-state-${viewUUID}`

function toSlimSnapshotSegments(segments: AudioSegment[]): AudioSegment[] {
  return segments.map(({ audioBase64, ...rest }) => rest)
}

function mergeLocalAudioSegments(baseSegments: AudioSegment[], localSegments: AudioSegment[] | null): AudioSegment[] {
  if (!localSegments?.length) return baseSegments
  return baseSegments.map((segment, index) => {
    const local = localSegments[index]
    if (!local?.audioBase64) return segment
    if (local.text !== segment.text || local.speaker !== segment.speaker) return segment
    return {
      ...segment,
      audioBase64: local.audioBase64,
      speakerName: segment.speakerName ?? local.speakerName,
    }
  })
}

export function loadLocalSnapshot(viewUUID?: string): AudioSegment[] | null {
  if (!viewUUID) return null
  try {
    const rawFull = localStorage.getItem(playerSnapshotFullKey(viewUUID))
    if (rawFull) {
      const parsedFull = JSON.parse(rawFull) as { segments?: AudioSegment[] }
      if (Array.isArray(parsedFull.segments)) return parsedFull.segments
    }

    const rawSlim = localStorage.getItem(playerSnapshotSlimKey(viewUUID))
    if (!rawSlim) return null
    const parsedSlim = JSON.parse(rawSlim) as { segments?: AudioSegment[] }
    return Array.isArray(parsedSlim.segments) ? parsedSlim.segments : null
  } catch {
    return null
  }
}

export function saveLocalSnapshot(viewUUID: string | undefined, segments: AudioSegment[]): void {
  if (!viewUUID || segments.length === 0) return

  try {
    localStorage.setItem(playerSnapshotFullKey(viewUUID), JSON.stringify({ segments }))
    localStorage.setItem(playerSnapshotSlimKey(viewUUID), JSON.stringify({ segments: toSlimSnapshotSegments(segments) }))
  } catch (error) {
    try {
      localStorage.setItem(playerSnapshotSlimKey(viewUUID), JSON.stringify({ segments: toSlimSnapshotSegments(segments) }))
    } catch (fallbackError) {
      console.warn('[playerStateRecovery] Failed to save local snapshot:', fallbackError)
    }
    console.warn('[playerStateRecovery] Failed to save full local snapshot:', error)
  }
}

export async function resolveRestoredSegments(
  app: App,
  viewUUID: string | undefined,
  initialSegments: AudioSegment[]
): Promise<AudioSegment[]> {
  let restoredSegments = initialSegments
  const localSegments = loadLocalSnapshot(viewUUID)

  try {
    const restoredByView = await fetchPlayerStateOnServer(app, { viewUUID })
    if (restoredByView?.segments?.length) {
      restoredSegments = restoredByView.segments
    } else {
      const restoredBySession = await fetchPlayerStateOnServer(app, {})
      if (restoredBySession?.segments?.length) {
        restoredSegments = restoredBySession.segments
      } else if (localSegments?.length) {
        restoredSegments = localSegments
      }
    }
  } catch (error) {
    console.warn('[playerStateRecovery] Failed to restore player state:', error)
    if (localSegments?.length) restoredSegments = localSegments
  }

  return mergeLocalAudioSegments(restoredSegments, localSegments)
}
