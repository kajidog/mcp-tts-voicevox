/**
 * クロスプラットフォームで実行権限を設定するスクリプト
 * Windowsではfs.chmodは機能しないが、shebangの追加は効果あり
 */
const fs = require('node:fs')
const path = require('node:path')

// ターゲットファイルのパス
const indexJsPath = path.join(__dirname, '..', 'dist', 'index.js')

try {
  // distディレクトリが存在するか確認
  const distDir = path.join(__dirname, '..', 'dist')
  if (!fs.existsSync(distDir)) {
    console.log('distディレクトリが見つかりません。自動的に作成します。')
    fs.mkdirSync(distDir, { recursive: true })
  }

  // index.jsファイルが存在するか確認
  if (!fs.existsSync(indexJsPath)) {
    console.log(`${indexJsPath} が見つかりません。ビルドが完了していない可能性があります。`)
    console.log('パーミッション修正をスキップします')
    process.exit(0)
  }

  // ファイルの内容を読み込む
  let content = fs.readFileSync(indexJsPath, 'utf8')

  // すでにshebangが含まれているか確認
  if (!content.startsWith('#!/usr/bin/env node')) {
    // shebangがなければ追加
    content = `#!/usr/bin/env node\n${content}`
    fs.writeFileSync(indexJsPath, content, 'utf8')
    console.log(`${indexJsPath} にshebangを追加しました`)
  } else {
    console.log(`${indexJsPath} には既にshebangが含まれています`)
  }

  // Unix系OSの場合のみchmodを実行（Windows以外）
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(indexJsPath, '755')
      console.log(`${indexJsPath} に実行権限を設定しました`)
    } catch (chmodError) {
      console.warn(`警告: 実行権限の設定に失敗しました: ${chmodError.message}`)
    }
  } else {
    console.log('Windowsでは実行権限の設定はスキップされます')
  }

  console.log('パーミッション修正が完了しました')
} catch (error) {
  console.error(`エラー: ${error.message}`)
  process.exit(1)
}
