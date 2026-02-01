/**
 * ファイル再生モードのテスト
 * 一時ファイルを作成してからプラットフォームのデフォルトプレイヤーで再生
 *
 * 使い方: npx ts-node file-playback.ts
 */
import { createClient, createTimer, exit, printHeader, printSubHeader } from '../common/utils'

async function main() {
  printHeader('ファイル再生モードのテスト')

  // useStreaming: false でファイル再生モードを強制
  const client = createClient({ useStreaming: false })
  const timer = createTimer()

  try {
    // 再生モードの確認
    const isStreaming = client.getQueueService().isStreamingEnabled()
    console.log(`\n再生モード: ${isStreaming ? 'ストリーミング' : 'ファイル再生'}`)

    if (isStreaming) {
      console.log('⚠ ストリーミングモードになっています。useStreaming: false が反映されていません。')
      exit(1)
      return
    }
    console.log('✓ ファイル再生モードが有効です\n')

    // テスト1: 基本的なファイル再生
    printSubHeader('テスト1: 基本的なファイル再生')

    timer.log('再生開始')
    await client.speak('これはファイル再生モードのテストです。', {
      immediate: false,
      waitForEnd: true,
    })
    timer.log('再生完了')

    // テスト2: 複数テキストのキュー再生
    printSubHeader('テスト2: 複数テキストのキュー再生')

    const texts = ['1番目のテキストです。', '2番目のテキストです。', '3番目のテキストです。']

    timer.log('キューへの追加開始')
    for (let i = 0; i < texts.length; i++) {
      const isLast = i === texts.length - 1
      await client.speak(texts[i], {
        immediate: false,
        waitForEnd: isLast,
      })
      if (!isLast) {
        timer.log(`テキスト${i + 1}をキューに追加`)
      }
    }
    timer.log('全再生完了')

    // テスト3: 話者変更
    printSubHeader('テスト3: 話者変更 (speaker: 3)')

    timer.log('再生開始')
    await client.speak('話者を変更して再生しています。', {
      speaker: 3,
      immediate: false,
      waitForEnd: true,
    })
    timer.log('再生完了')

    console.log('\nファイル再生モードのテスト完了!')
  } catch (error) {
    console.error('エラー:', error)
    exit(1)
  }

  exit(0)
}

main()
