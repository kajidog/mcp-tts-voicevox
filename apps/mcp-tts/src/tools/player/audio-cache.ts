import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  type AccentPhrase,
  type AudioQuery,
  planAudioCacheCleanup,
  resolveAudioCachePolicy,
} from '@kajidog/voicevox-client'
import type { ToolDeps } from '../types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIO_CACHE_FILE_PATTERN = /^[a-f0-9]{64}\.txt$/
const DEFAULT_AUDIO_CACHE_TTL_DAYS = 30
const DEFAULT_AUDIO_CACHE_MAX_MB = 512
const AUDIO_CACHE_CLEANUP_EVERY_WRITES = 20

// ---------------------------------------------------------------------------
// AudioCacheStore
// ---------------------------------------------------------------------------

export class AudioCacheStore {
  private dir: string
  private readonly mem = new Map<string, string>()

  private isDiskEnabled: boolean
  private ttlMs: number | null
  private maxBytes: number | null

  private cleanupRunning = false
  private pendingCleanup = false
  private writesSinceCleanup = 0

  constructor(config: ToolDeps['config']) {
    this.dir = config.playerCacheDir || join(process.cwd(), '.voicevox-player-cache')

    const enabledFlag = config.playerAudioCacheEnabled !== false
    const ttlDays = Number.isFinite(config.playerAudioCacheTtlDays)
      ? config.playerAudioCacheTtlDays
      : DEFAULT_AUDIO_CACHE_TTL_DAYS
    const maxMb = Number.isFinite(config.playerAudioCacheMaxMb)
      ? config.playerAudioCacheMaxMb
      : DEFAULT_AUDIO_CACHE_MAX_MB

    const cachePolicy = resolveAudioCachePolicy({ enabledFlag, ttlDays, maxMb })
    this.isDiskEnabled = cachePolicy.isDiskCacheEnabled
    this.ttlMs = cachePolicy.ttlMs
    this.maxBytes = cachePolicy.maxBytes

    try {
      mkdirSync(this.dir, { recursive: true })
      if (this.isDiskEnabled) {
        this.scheduleCleanup(true)
      }
    } catch (error) {
      console.warn('Warning: failed to create VOICEVOX player cache directory:', error)
    }
  }

  getDir(): string {
    return this.dir
  }

  readCachedBase64(cacheKey: string): string | null {
    const inMemory = this.mem.get(cacheKey)
    if (inMemory) return inMemory
    if (!this.isDiskEnabled) return null

    const filePath = join(this.dir, `${cacheKey}.txt`)
    try {
      const base64 = readFileSync(filePath, 'utf-8').trim()
      if (base64.length > 0) {
        this.mem.set(cacheKey, base64)
        return base64
      }
    } catch {
      // cache miss
    }
    return null
  }

  async writeCachedBase64(cacheKey: string, base64: string): Promise<void> {
    this.mem.set(cacheKey, base64)
    if (!this.isDiskEnabled) return
    const filePath = join(this.dir, `${cacheKey}.txt`)
    try {
      await writeFile(filePath, base64, 'utf-8')
      this.scheduleCleanup()
    } catch (error) {
      console.warn('Warning: failed to write VOICEVOX player cache:', error)
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  private async cleanupFiles(): Promise<void> {
    if (!this.isDiskEnabled) return

    try {
      const entries = await readdir(this.dir, { withFileTypes: true })
      const now = Date.now()
      const files: Array<{ name: string; path: string; size: number; mtimeMs: number }> = []

      for (const entry of entries) {
        if (!entry.isFile() || !AUDIO_CACHE_FILE_PATTERN.test(entry.name)) continue
        const filePath = join(this.dir, entry.name)
        let fileStat: Stats
        try {
          fileStat = await stat(filePath)
        } catch {
          continue
        }
        files.push({ name: entry.name, path: filePath, size: fileStat.size, mtimeMs: fileStat.mtimeMs })
      }

      const toDelete = planAudioCacheCleanup({
        entries: files,
        now,
        ttlMs: this.ttlMs,
        maxBytes: this.maxBytes,
      })

      if (toDelete.size === 0) return

      for (const path of toDelete) {
        try {
          await unlink(path)
        } catch {
          // ignore cleanup races
        }
        const fileName = basename(path)
        if (fileName.endsWith('.txt')) {
          this.mem.delete(fileName.slice(0, -4))
        }
      }
    } catch (error) {
      console.warn('Warning: failed to cleanup VOICEVOX player audio cache:', error)
    }
  }

  private scheduleCleanup(force = false): void {
    if (!this.isDiskEnabled) return
    if (!force) {
      this.writesSinceCleanup += 1
      if (this.writesSinceCleanup < AUDIO_CACHE_CLEANUP_EVERY_WRITES) return
    }
    this.writesSinceCleanup = 0
    if (this.cleanupRunning) {
      this.pendingCleanup = true
      return
    }
    this.cleanupRunning = true
    void this.cleanupFiles()
      .catch((error) => console.warn('Warning: failed to cleanup VOICEVOX player audio cache:', error))
      .finally(() => {
        this.cleanupRunning = false
        if (this.pendingCleanup) {
          this.pendingCleanup = false
          this.scheduleCleanup(true)
        }
      })
  }
}

// ---------------------------------------------------------------------------
// Pure utility (no state dependency)
// ---------------------------------------------------------------------------

export function createAudioCacheKey(input: {
  text: string
  speaker: number
  audioQuery?: AudioQuery
  speedScale: number
  dictionaryRevision?: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
  accentPhrases?: AccentPhrase[]
}): string {
  const keyInput = input.audioQuery
    ? JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        dictionaryRevision: input.dictionaryRevision ?? 0,
        audioQuery: input.audioQuery,
      })
    : JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        dictionaryRevision: input.dictionaryRevision ?? 0,
        speedScale: Number(input.speedScale.toFixed(4)),
        intonationScale: input.intonationScale === undefined ? null : Number(input.intonationScale.toFixed(4)),
        volumeScale: input.volumeScale === undefined ? null : Number(input.volumeScale.toFixed(4)),
        prePhonemeLength: input.prePhonemeLength === undefined ? null : Number(input.prePhonemeLength.toFixed(4)),
        postPhonemeLength: input.postPhonemeLength === undefined ? null : Number(input.postPhonemeLength.toFixed(4)),
        pauseLengthScale: input.pauseLengthScale === undefined ? null : Number(input.pauseLengthScale.toFixed(4)),
        accentPhrases: input.accentPhrases ?? null,
      })
  return createHash('sha256').update(keyInput).digest('hex')
}
