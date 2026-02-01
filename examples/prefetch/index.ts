/**
 * プリフェッチ動作テスト
 * 音声生成の先読みが正しく機能しているかを確認
 *
 * 使い方: npx ts-node prefetch.ts
 */
import { createClient, createTimer, exit, printHeader, printSubHeader, sleep } from '../common/utils'

async function main() {
  printHeader('プリフェッチ動作テスト')

  const client = createClient()

  try {
    // テスト1: プリフェッチ効果の確認
    printSubHeader('テスト1: プリフェッチ効果の確認（順次再生vs一括追加）')
    console.log('まず順次に1件ずつ再生し、次に一括追加で再生して比較します\n')

    const texts = [
      'これは1番目のテキストです。音声合成の処理時間を長くするために、少し長めの文章にしています。',
      'これは2番目のテキストです。プリフェッチ機能が効いていれば、この音声は前の再生中に生成されているはずです。',
      'これは3番目のテキストです。長いテキストほど音声生成に時間がかかるため、プリフェッチの効果が顕著になります。',
      'これは4番目のテキストです。一括追加モードでは、音声生成がバックグラウンドで並列に実行されます。',
      'これは5番目のテキストです。最後のテキストまでプリフェッチが効いていれば、大幅な時間短縮が期待できます。',
    ]

    // 順次再生（プリフェッチなし）
    console.log('【パターンA】順次再生（1件ずつ追加→完了を待つ）')
    const timer = createTimer()

    for (let i = 0; i < texts.length; i++) {
      await client.speak(texts[i], {
        immediate: false,
        waitForEnd: true,
      })
      timer.log(`テキスト${i + 1}再生完了`)
    }
    const sequentialTime = timer.elapsed()
    console.log(`順次再生の総時間: ${sequentialTime}ms\n`)

    // 一括追加（プリフェッチあり）
    console.log('【パターンB】一括追加（全て追加→最後だけ待つ）')
    const timer2 = createTimer()

    for (let i = 0; i < texts.length; i++) {
      const isLast = i === texts.length - 1
      await client.speak(texts[i], {
        immediate: false,
        waitForEnd: isLast,
      })
      if (!isLast) {
        timer2.log(`テキスト${i + 1}をキューに追加`)
      } else {
        timer2.log(`テキスト${i + 1}を追加、全再生完了まで待機`)
      }
    }
    const batchTime = timer2.elapsed()
    console.log(`一括追加の総時間: ${batchTime}ms`)

    // 結果比較
    console.log('\n--- 結果サマリー ---')
    console.log(`順次再生: ${sequentialTime}ms`)
    console.log(`一括追加: ${batchTime}ms`)

    const timeSaved = sequentialTime - batchTime

    if (timeSaved > 0) {
      console.log(`\n✓ プリフェッチにより ${timeSaved}ms 短縮されました！`)
    } else {
      console.log('\n△ 一括追加による改善は見られませんでした。')
    }

    console.log('\nプリフェッチテスト完了!')
  } catch (error) {
    console.error('エラー:', error)
    exit(1)
  }

  exit(0)
}

main()
