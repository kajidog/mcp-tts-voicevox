/**
 * 共通ユーティリティ関数
 */
import { VoicevoxClient } from '@kajidog/voicevox-client'

/**
 * ヘッダーを出力
 */
export function printHeader(title: string): void {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'='.repeat(60)}`)
}

/**
 * サブヘッダーを出力
 */
export function printSubHeader(title: string): void {
  console.log(`\n--- ${title} ---`)
}

/**
 * 経過時間を表示するタイマー
 */
export function createTimer() {
  const start = Date.now()
  return {
    elapsed: () => Date.now() - start,
    log: (label: string) => {
      console.log(`  [${Date.now() - start}ms] ${label}`)
    },
  }
}

/**
 * VoicevoxClientを作成
 */
export function createClient(): VoicevoxClient {
  return new VoicevoxClient({
    url: process.env.VOICEVOX_URL ?? 'http://localhost:50021',
    defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER ?? 1),
    defaultSpeedScale: Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE ?? 1.0),
  })
}

/**
 * 待機
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * プロセス終了処理
 */
export function exit(code = 0): void {
  console.log('\nプロセスを終了します...')
  setTimeout(() => process.exit(code), 500)
}
