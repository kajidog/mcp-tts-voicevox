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
// SessionStateStore
// ---------------------------------------------------------------------------

export class SessionStateStore {
  private readonly state = new Map<string, PlayerSessionState>()
  private filePath: string
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: ToolDeps['config'], audioCacheDir: string) {
    this.filePath = config.playerStateFile || join(audioCacheDir, 'player-state.json')

    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
    } catch (error) {
      console.warn('Warning: failed to prepare player state directory:', error)
    }

    this.loadFromDisk()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  set(key: string, sessionState: PlayerSessionState): void {
    this.state.set(key, sessionState)
    this.scheduleSave()
  }

  get(viewUUID: string | undefined, sessionId: string | undefined): PlayerSessionState | undefined {
    if (viewUUID) {
      const s = this.state.get(viewUUID)
      if (s) return s
    }
    const key = sessionId ?? 'global'
    const s = this.state.get(key)
    if (s) return s
    return undefined
  }

  getByKey(key: string): PlayerSessionState | undefined {
    return this.state.get(key)
  }

  // -------------------------------------------------------------------------
  // Disk persistence
  // -------------------------------------------------------------------------

  private async saveToDisk(): Promise<void> {
    try {
      const now = Date.now()
      const validEntries = [...this.state.entries()]
        .filter(([, s]) => now - s.updatedAt <= MAX_STATE_AGE_MS)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, MAX_PERSISTED_STATES)

      this.state.clear()
      for (const [key, s] of validEntries) {
        this.state.set(key, s)
      }

      const payload = JSON.stringify({
        version: 1,
        savedAt: now,
        entries: validEntries,
      })
      const tempPath = `${this.filePath}.tmp`
      await writeFile(tempPath, payload, 'utf-8')
      await rename(tempPath, this.filePath)
    } catch (error) {
      console.warn('Warning: failed to persist player state:', error)
    }
  }

  private scheduleSave(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.saveToDisk().catch((e) => console.warn('Warning: failed to persist player state:', e))
    }, 300)
  }

  private loadFromDisk(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as {
        entries?: Array<[string, PlayerSessionState]>
      }
      if (!Array.isArray(parsed.entries)) return

      const now = Date.now()
      for (const entry of parsed.entries) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [key, s] = entry
        if (!key || typeof key !== 'string') continue
        if (!s || typeof s.updatedAt !== 'number' || !Array.isArray(s.segments)) continue
        if (now - s.updatedAt > MAX_STATE_AGE_MS) continue
        this.state.set(key, s)
      }
    } catch {
      // 初回起動や破損時は空状態で継続
    }
  }
}
