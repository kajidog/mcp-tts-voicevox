import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AccentPhrase, AudioQuery } from '@kajidog/voicevox-client'
import { planAudioCacheCleanup, resolveAudioCachePolicy } from './player-cache-utils.js'
import type { ToolDeps } from './types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIO_CACHE_FILE_PATTERN = /^[a-f0-9]{64}\.txt$/
const DEFAULT_AUDIO_CACHE_TTL_DAYS = 30
const DEFAULT_AUDIO_CACHE_MAX_MB = 512
const AUDIO_CACHE_CLEANUP_EVERY_WRITES = 20

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let audioCacheDir = join(process.cwd(), '.voicevox-player-cache')
const audioCacheMem = new Map<string, string>()

let audioCacheEnabledFlag = true
let audioCacheTtlDays = DEFAULT_AUDIO_CACHE_TTL_DAYS
let audioCacheMaxMb = DEFAULT_AUDIO_CACHE_MAX_MB

let isAudioDiskCacheEnabled = audioCacheEnabledFlag && audioCacheTtlDays !== 0 && audioCacheMaxMb !== 0
let audioCacheTtlMs: number | null = audioCacheTtlDays < 0 ? null : audioCacheTtlDays * 24 * 60 * 60 * 1000
let audioCacheMaxBytes: number | null = audioCacheMaxMb < 0 ? null : audioCacheMaxMb * 1024 * 1024

let isAudioCacheCleanupRunning = false
let pendingAudioCacheCleanup = false
let writesSinceLastAudioCleanup = 0

// ---------------------------------------------------------------------------
// Cache cleanup
// ---------------------------------------------------------------------------

async function cleanupAudioCacheFiles(): Promise<void> {
  if (!isAudioDiskCacheEnabled) return

  try {
    const entries = await readdir(audioCacheDir, { withFileTypes: true })
    const now = Date.now()
    const files: Array<{ name: string; path: string; size: number; mtimeMs: number }> = []

    for (const entry of entries) {
      if (!entry.isFile() || !AUDIO_CACHE_FILE_PATTERN.test(entry.name)) continue
      const filePath = join(audioCacheDir, entry.name)
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
      ttlMs: audioCacheTtlMs,
      maxBytes: audioCacheMaxBytes,
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
        audioCacheMem.delete(fileName.slice(0, -4))
      }
    }
  } catch (error) {
    console.warn('Warning: failed to cleanup VOICEVOX player audio cache:', error)
  }
}

function scheduleAudioCacheCleanup(force = false): void {
  if (!isAudioDiskCacheEnabled) return
  if (!force) {
    writesSinceLastAudioCleanup += 1
    if (writesSinceLastAudioCleanup < AUDIO_CACHE_CLEANUP_EVERY_WRITES) return
  }
  writesSinceLastAudioCleanup = 0
  if (isAudioCacheCleanupRunning) {
    pendingAudioCacheCleanup = true
    return
  }
  isAudioCacheCleanupRunning = true
  void cleanupAudioCacheFiles()
    .catch((error) => console.warn('Warning: failed to cleanup VOICEVOX player audio cache:', error))
    .finally(() => {
      isAudioCacheCleanupRunning = false
      if (pendingAudioCacheCleanup) {
        pendingAudioCacheCleanup = false
        scheduleAudioCacheCleanup(true)
      }
    })
}

// ---------------------------------------------------------------------------
// Cache key generation
// ---------------------------------------------------------------------------

export function createAudioCacheKey(input: {
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
}): string {
  const keyInput = input.audioQuery
    ? JSON.stringify({
        speaker: input.speaker,
        text: input.text,
        audioQuery: input.audioQuery,
      })
    : JSON.stringify({
        speaker: input.speaker,
        text: input.text,
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

// ---------------------------------------------------------------------------
// Cache read / write
// ---------------------------------------------------------------------------

export function readCachedAudioBase64(cacheKey: string): string | null {
  const inMemory = audioCacheMem.get(cacheKey)
  if (inMemory) return inMemory
  if (!isAudioDiskCacheEnabled) return null

  const filePath = join(audioCacheDir, `${cacheKey}.txt`)
  try {
    const base64 = readFileSync(filePath, 'utf-8').trim()
    if (base64.length > 0) {
      audioCacheMem.set(cacheKey, base64)
      return base64
    }
  } catch {
    // cache miss
  }
  return null
}

export async function writeCachedAudioBase64(cacheKey: string, base64: string): Promise<void> {
  audioCacheMem.set(cacheKey, base64)
  if (!isAudioDiskCacheEnabled) return
  const filePath = join(audioCacheDir, `${cacheKey}.txt`)
  try {
    await writeFile(filePath, base64, 'utf-8')
    scheduleAudioCacheCleanup()
  } catch (error) {
    console.warn('Warning: failed to write VOICEVOX player cache:', error)
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function getAudioCacheDir(): string {
  return audioCacheDir
}

export function initializeAudioCache(config: ToolDeps['config']): void {
  audioCacheDir = config.playerCacheDir || audioCacheDir

  audioCacheEnabledFlag = config.playerAudioCacheEnabled !== false
  audioCacheTtlDays = Number.isFinite(config.playerAudioCacheTtlDays)
    ? config.playerAudioCacheTtlDays
    : DEFAULT_AUDIO_CACHE_TTL_DAYS
  audioCacheMaxMb = Number.isFinite(config.playerAudioCacheMaxMb)
    ? config.playerAudioCacheMaxMb
    : DEFAULT_AUDIO_CACHE_MAX_MB

  const cachePolicy = resolveAudioCachePolicy({
    enabledFlag: audioCacheEnabledFlag,
    ttlDays: audioCacheTtlDays,
    maxMb: audioCacheMaxMb,
  })
  isAudioDiskCacheEnabled = cachePolicy.isDiskCacheEnabled
  audioCacheTtlMs = cachePolicy.ttlMs
  audioCacheMaxBytes = cachePolicy.maxBytes

  try {
    mkdirSync(audioCacheDir, { recursive: true })
    if (isAudioDiskCacheEnabled) {
      scheduleAudioCacheCleanup(true)
    }
  } catch (error) {
    console.warn('Warning: failed to create VOICEVOX player cache directory:', error)
  }
}
