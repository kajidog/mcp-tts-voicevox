/**
 * キュー動作テスト
 * 複数のテキストを連続して再生し、キューの動作を確認
 *
 * 使い方: npx ts-node queue.ts
 */
import { createClient, createTimer, exit, printHeader, printSubHeader, sleep } from '../common/utils'

async function main() {
  printHeader('キュー動作テスト')

  const client = createClient()
  const timer = createTimer()

  try {
    // テスト1: 複数テキストの順次再生
    printSubHeader('テスト1: 複数テキストの順次再生')
    console.log('5つのテキストをキューに追加して順番に再生します\n')

    const texts = [
      '1番目のテキストです。',
      '2番目のテキストです。',
      '3番目のテキストです。',
      '4番目のテキストです。',
      '5番目のテキストです。',
    ]

    timer.log('キューへの追加開始')

    // 順番にキューに追加（waitForEnd: falseで即座に次へ）
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]
      timer.log(`テキスト${i + 1}を追加`)

      // 最後のアイテムだけ終了を待つ
      const isLast = i === texts.length - 1
      await client.speak(text, {
        immediate: false,
        waitForEnd: isLast,
      })

      if (isLast) {
        timer.log('全ての再生が完了')
      }
    }

    // テスト2: immediate オプションのテスト
    printSubHeader('テスト2: immediate オプション（割り込み再生）')
    console.log('キューをクリアして即座に新しいテキストを再生します\n')

    // まずキューに複数追加
    timer.log('通常テキストを追加')
    await client.speak('これは通常のテキストです。', { immediate: false, waitForEnd: false })
    await client.speak('次のテキストです。', { immediate: false, waitForEnd: false })

    await sleep(500) // 少し待つ

    // immediate: true で割り込み
    timer.log('immediate: true で割り込み再生')
    await client.speak('割り込みました！キューはクリアされています。', {
      immediate: true,
      waitForEnd: true,
    })
    timer.log('割り込み再生完了')

    // テスト3: 長いテキストと短いテキストの混在
    printSubHeader('テスト3: 長短テキストの混在')

    const mixedTexts = [
      '短いです。',
      'これは少し長めのテキストです。音声合成の処理時間が異なることを確認できます。',
      '中くらい。',
      'とても長いテキストを読み上げます。プリフェッチ機能により、次のテキストの準備が事前に行われているため、待ち時間が短縮されているはずです。',
      '最後です。',
    ]

    timer.log('長短混在テキストの追加開始')

    for (let i = 0; i < mixedTexts.length; i++) {
      const isLast = i === mixedTexts.length - 1
      timer.log(`テキスト${i + 1}を追加 (${mixedTexts[i].length}文字)`)
      await client.speak(mixedTexts[i], { immediate: false, waitForEnd: isLast })
    }

    timer.log('全ての再生完了')

    console.log('\nキューテスト完了!')
  } catch (error) {
    console.error('エラー:', error)
    exit(1)
  }

  exit(0)
}

main()
