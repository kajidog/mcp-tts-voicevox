import type { ToolDeps } from '../types.js'
import type { PlayerSessionState, PlayerUIShared } from './types.js'

export interface PlayerUIToolContext {
  deps: ToolDeps
  shared: PlayerUIShared
  speakerIconCache: Map<string, string>
  saveStateForViewAndSession: (stateKey: string, sessionId: string | undefined, state: PlayerSessionState) => void
  resolveSpeakerNameMap: (segments: Array<{ speaker?: number }>, defaultSpeaker: number) => Promise<Map<number, string>>
}

export function createPlayerUIToolContext(deps: ToolDeps, shared: PlayerUIShared): PlayerUIToolContext {
  const speakerIconCache = new Map<string, string>()
  const saveStateForViewAndSession = (stateKey: string, sessionId: string | undefined, state: PlayerSessionState) => {
    // viewUUID と sessionId の双方で引けるように同じ状態を保存する。
    shared.setSessionState(stateKey, state)
    if (sessionId && sessionId !== stateKey) {
      shared.setSessionState(sessionId, state)
    }
  }

  const resolveSpeakerNameMap = async (
    segments: Array<{ speaker?: number }>,
    defaultSpeaker: number
  ): Promise<Map<number, string>> => {
    // 同一speaker解決の無駄を避けるため、IDをユニーク化してから解決する。
    const list = await shared.getSpeakerList()
    const speakerNameMap = new Map<number, string>()
    for (const speakerId of [...new Set(segments.map((seg) => seg.speaker ?? defaultSpeaker))]) {
      const found = list.find((entry) => entry.id === speakerId)
      speakerNameMap.set(speakerId, found ? `${found.characterName}（${found.name}）` : `Speaker ${speakerId}`)
    }
    return speakerNameMap
  }

  return {
    deps,
    shared,
    speakerIconCache,
    saveStateForViewAndSession,
    resolveSpeakerNameMap,
  }
}
