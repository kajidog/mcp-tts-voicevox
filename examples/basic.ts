/**
 * 基本的なテキスト読み上げテスト
 *
 * 使い方: npx ts-node basic.ts
 */
import { createClient, createTimer, exit, printHeader } from './utils'

async function main() {
  printHeader('基本的な音声再生テスト')

  const client = createClient()
  const timer = createTimer()

  try {
    // シンプルなテキスト読み上げ
    console.log('\n1. シンプルなテキスト読み上げ')
    timer.log('speak開始')

    await client.speak('こんにちは。これは基本的な音声再生のテストです。', {
      waitForEnd: true,
    })

    timer.log('speak完了')

    // 話者を指定した読み上げ
    console.log('\n2. 話者を指定した読み上げ (speaker: 3)')
    timer.log('speak開始')

    await client.speak('話者を変更して読み上げています。', {
      speaker: 3,
      waitForEnd: true,
    })

    timer.log('speak完了')

    // 速度を変更した読み上げ
    console.log('\n3. 速度を変更した読み上げ (1.5倍速)')
    timer.log('speak開始')

    await client.speak('速度を1.5倍に設定しています。', {
      speedScale: 1.5,
      waitForEnd: true,
    })

    timer.log('speak完了')

    console.log('\n基本テスト完了!')
  } catch (error) {
    console.error('エラー:', error)
    exit(1)
  }

  exit(0)
}

main()
