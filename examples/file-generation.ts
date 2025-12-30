/**
 * 音声ファイル生成テスト
 * テキストからWAVファイルを生成する機能を確認
 *
 * 使い方: npx ts-node file-generation.ts
 */
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, createTimer, exit, printHeader, printSubHeader } from './utils'

async function main() {
  printHeader('音声ファイル生成テスト')

  const client = createClient()
  const timer = createTimer()
  const generatedFiles: string[] = []

  try {
    // テスト1: テキストから直接ファイル生成
    printSubHeader('テスト1: テキストから直接ファイル生成')

    timer.log('ファイル生成開始')
    const filePath1 = await client.generateAudioFile(
      'これはテキストから直接生成した音声ファイルです。',
      join(tmpdir(), `voicevox-test-${Date.now()}.wav`)
    )
    timer.log('ファイル生成完了')

    const stats1 = await fs.stat(filePath1)
    console.log(`  生成ファイル: ${filePath1}`)
    console.log(`  ファイルサイズ: ${stats1.size} bytes`)
    generatedFiles.push(filePath1)

    // テスト2: クエリを生成してからファイル生成
    printSubHeader('テスト2: クエリ経由でファイル生成')

    timer.log('クエリ生成開始')
    const query = await client.generateQuery('クエリを経由して生成した音声です。')
    timer.log('クエリ生成完了')

    // クエリの速度を変更
    query.speedScale = 1.3

    timer.log('ファイル生成開始')
    const filePath2 = await client.generateAudioFile(query, join(tmpdir(), `voicevox-query-${Date.now()}.wav`))
    timer.log('ファイル生成完了')

    const stats2 = await fs.stat(filePath2)
    console.log(`  生成ファイル: ${filePath2}`)
    console.log(`  ファイルサイズ: ${stats2.size} bytes`)
    generatedFiles.push(filePath2)

    // テスト3: 異なる話者でファイル生成
    printSubHeader('テスト3: 異なる話者でファイル生成')

    const speakers = [1, 3, 5]
    for (const speaker of speakers) {
      timer.log(`話者${speaker}で生成開始`)
      const filePath = await client.generateAudioFile(
        `話者${speaker}の音声です。`,
        join(tmpdir(), `voicevox-speaker${speaker}-${Date.now()}.wav`),
        speaker
      )
      timer.log(`話者${speaker}で生成完了`)

      const stats = await fs.stat(filePath)
      console.log(`  話者${speaker}: ${filePath} (${stats.size} bytes)`)
      generatedFiles.push(filePath)
    }

    // テスト4: 速度を変更してファイル生成
    printSubHeader('テスト4: 速度を変更してファイル生成')

    const speeds = [0.8, 1.0, 1.5]
    for (const speed of speeds) {
      timer.log(`速度${speed}で生成開始`)
      const filePath = await client.generateAudioFile(
        `速度${speed}倍の音声です。`,
        join(tmpdir(), `voicevox-speed${speed}-${Date.now()}.wav`),
        undefined,
        speed
      )
      timer.log(`速度${speed}で生成完了`)

      const stats = await fs.stat(filePath)
      console.log(`  速度${speed}: ${filePath} (${stats.size} bytes)`)
      generatedFiles.push(filePath)
    }

    // サマリー
    console.log('\n--- 生成ファイル一覧 ---')
    for (const file of generatedFiles) {
      console.log(`  ${file}`)
    }

    console.log('\nファイル生成テスト完了!')
    console.log('生成したファイルは一時ディレクトリにあります。')
  } catch (error) {
    console.error('エラー:', error)
    exit(1)
  }

  exit(0)
}

main()
