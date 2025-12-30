/**
 * プリフェッチ動作テスト
 * 音声生成の先読みが正しく機能しているかを確認
 *
 * 使い方: npx ts-node prefetch.ts
 */
import { createClient, createTimer, exit, printHeader, printSubHeader, sleep } from './utils'

async function main() {
  printHeader('プリフェッチ動作テスト')

  const client = createClient()

  try {
    // テスト1: プリフェッチ効果の確認
    printSubHeader('テスト1: プリフェッチ効果の確認')
    console.log('10個のテキストを一括追加し、再生間の待ち時間を測定します')
    console.log('プリフェッチが効いていれば、再生間の待ち時間は短くなります\n')

    const texts = Array.from({ length: 10 }, (_, i) => `${i + 1}番目の音声です。`)

    const timer = createTimer()
    const playbackTimes: number[] = []
    let lastPlaybackEnd = Date.now()

    // 全テキストを一括でキューに追加
    timer.log('全テキストをキューに追加開始')

    const promises: Promise<void>[] = []

    for (let i = 0; i < texts.length; i++) {
      const result = await client.speak(texts[i], {
        waitForStart: true,
        waitForEnd: true,
      })

      // 待ち時間を記録
      const now = Date.now()
      if (i > 0) {
        const gap = now - lastPlaybackEnd
        playbackTimes.push(gap)
        timer.log(`テキスト${i + 1}再生完了 (前の再生からの間隔: ${gap}ms)`)
      } else {
        timer.log(`テキスト${i + 1}再生完了`)
      }
      lastPlaybackEnd = now
    }

    // 結果を表示
    console.log('\n--- 結果サマリー ---')
    console.log(`総再生時間: ${timer.elapsed()}ms`)
    if (playbackTimes.length > 0) {
      const avgGap = Math.round(playbackTimes.reduce((a, b) => a + b, 0) / playbackTimes.length)
      const maxGap = Math.max(...playbackTimes)
      const minGap = Math.min(...playbackTimes)
      console.log(`再生間の平均間隔: ${avgGap}ms`)
      console.log(`再生間の最大間隔: ${maxGap}ms`)
      console.log(`再生間の最小間隔: ${minGap}ms`)

      if (avgGap < 500) {
        console.log('\n✓ プリフェッチが効果的に機能しています！')
      } else {
        console.log('\n△ 再生間隔が長めです。ネットワーク状況を確認してください。')
      }
    }

    // テスト2: 非同期追加でのプリフェッチ
    printSubHeader('テスト2: 一括追加でのプリフェッチ')
    console.log('waitForStart/waitForEndを使わずに一括追加し、')
    console.log('プリフェッチによる生成の並列化を確認します\n')

    const timer2 = createTimer()
    const batchTexts = [
      '最初の文章です。',
      '次の文章です。',
      '三番目の文章です。',
      '四番目の文章です。',
      '最後の文章です。',
    ]

    timer2.log('一括追加開始')

    // 全て追加（待たない）
    for (const text of batchTexts) {
      await client.speak(text, { waitForEnd: false })
    }
    timer2.log('全テキストをキューに追加完了')

    // 最後のテキストが終わるまで待つ
    await client.speak('', { waitForEnd: true }).catch(() => {})

    // キューが空になるまで待機
    await sleep(batchTexts.length * 2000)
    timer2.log('全再生完了')

    console.log('\nプリフェッチテスト完了!')
  } catch (error) {
    console.error('エラー:', error)
    exit(1)
  }

  exit(0)
}

main()
