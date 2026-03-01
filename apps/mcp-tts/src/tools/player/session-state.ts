import { mkdirSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AccentPhrase, AudioQuery } from '@kajidog/voicevox-client'
import type { ToolDeps } from '../types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerSegmentState {
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

export interface PlayerSessionState {
  segments: PlayerSegmentState[]
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_TOOL_CONTENT_BYTES = 1024 * 1024
export const DEFAULT_STATE_PAGE_LIMIT = 100
export const MAX_STATE_PAGE_LIMIT = 1000
const MAX_PERSISTED_STATES = 500
const MAX_STATE_AGE_MS = 30 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const playerSessionState = new Map<string, PlayerSessionState>()
let stateFilePath = ''

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------

async function saveSessionStateToDisk(): Promise<void> {
  try {
    const now = Date.now()
    const validEntries = [...playerSessionState.entries()]
      .filter(([, state]) => now - state.updatedAt <= MAX_STATE_AGE_MS)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_PERSISTED_STATES)

    playerSessionState.clear()
    for (const [key, state] of validEntries) {
      playerSessionState.set(key, state)
    }

    const payload = JSON.stringify({
      version: 1,
      savedAt: now,
      entries: validEntries,
    })
    const tempPath = `${stateFilePath}.tmp`
    await writeFile(tempPath, payload, 'utf-8')
    await rename(tempPath, stateFilePath)
  } catch (error) {
    console.warn('Warning: failed to persist player state:', error)
  }
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleStateSave(): void {
  if (saveDebounceTimer !== null) clearTimeout(saveDebounceTimer)
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null
    saveSessionStateToDisk().catch((e) => console.warn('Warning: failed to persist player state:', e))
  }, 300)
}

function loadSessionStateFromDisk(): void {
  try {
    const raw = readFileSync(stateFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      entries?: Array<[string, PlayerSessionState]>
    }
    if (!Array.isArray(parsed.entries)) return

    const now = Date.now()
    for (const entry of parsed.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue
      const [key, state] = entry
      if (!key || typeof key !== 'string') continue
      if (!state || typeof state.updatedAt !== 'number' || !Array.isArray(state.segments)) continue
      if (now - state.updatedAt > MAX_STATE_AGE_MS) continue
      playerSessionState.set(key, state)
    }
  } catch {
    // 初回起動や破損時は空状態で継続
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setSessionState(key: string, state: PlayerSessionState): void {
  playerSessionState.set(key, state)
  scheduleStateSave()
}

export function getSessionState(
  viewUUID: string | undefined,
  sessionId: string | undefined
): PlayerSessionState | undefined {
  // viewUUID が指定されていれば最優先で検索
  if (viewUUID) {
    const s = playerSessionState.get(viewUUID)
    if (s) return s
  }
  // sessionId でフォールバック
  const key = sessionId ?? 'global'
  const s = playerSessionState.get(key)
  if (s) return s
  return undefined
}

export function getSessionStateByKey(key: string): PlayerSessionState | undefined {
  return playerSessionState.get(key)
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initializeSessionState(config: ToolDeps['config'], audioCacheDir: string): void {
  stateFilePath = config.playerStateFile || join(audioCacheDir, 'player-state.json')

  try {
    mkdirSync(dirname(stateFilePath), { recursive: true })
  } catch (error) {
    console.warn('Warning: failed to prepare player state directory:', error)
  }

  loadSessionStateFromDisk()
}
