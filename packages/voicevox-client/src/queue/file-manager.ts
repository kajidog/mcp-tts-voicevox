// ブラウザ環境でインポートエラーを避けるための条件付きインポート
import { isBrowser } from '../utils'

// Node.js環境でのみ必要なモジュール
let fsPromises: any
let path: any
let os: any

// ブラウザ以外の環境でのみインポート
if (!isBrowser()) {
  // 非同期で読み込み試行
  ;(async () => {
    try {
      // 動的インポートを使用して必要なモジュールを読み込む
      fsPromises = await import('node:fs/promises')
      path = await import('node:path')
      os = await import('node:os')
    } catch (error) {
      // 動的インポートが失敗した場合（古いNode.js環境など）、従来のrequireを使用
      try {
        fsPromises = require('node:fs/promises')
        path = require('node:path')
        os = require('node:os')
      } catch (requireError) {
        console.error(
          '必要なNode.jsモジュールを読み込めませんでした。この機能は正常に動作しない可能性があります。',
          requireError
        )
      }
    }
  })()
}

import { v4 as uuidv4 } from 'uuid'
import { handleError } from '../error'

/**
 * バイナリデータをUint8Arrayに変換（環境に依存しない方法）
 * @param data ArrayBufferデータ
 * @returns Uint8Array
 */
function arrayBufferToUint8Array(data: ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) {
    return data
  }
  return new Uint8Array(data)
}

/**
 * 一時ファイル管理クラス
 * 音声ファイルの一時保存と削除を担当
 */
export class AudioFileManager {
  // ブラウザで作成したblobURLを追跡するセット
  private blobUrls: Set<string> = new Set()

  /**
   * 一時ファイルのパスを生成
   * @returns 一時ファイルのフルパス
   */
  public createTempFilePath(): string {
    const uniqueFilename = `voicevox-${uuidv4()}.wav`
    if (isBrowser()) {
      return uniqueFilename
    }

    // Node.jsモジュールが利用可能か確認
    if (!path || !os) {
      throw new Error(
        'Node.jsモジュール（path, os）が読み込めません。Node.js環境で実行されていることを確認してください。'
      )
    }

    return path.join(os.tmpdir(), uniqueFilename)
  }

  /**
   * 一時ファイルを削除
   * @param filePath 削除するファイルのパスまたはblobURL
   */
  public async deleteTempFile(filePath: string): Promise<void> {
    if (isBrowser()) {
      // ブラウザ環境ではblobURLを解放
      this.releaseBlobUrl(filePath)
      return
    }

    // Node.jsモジュールが利用可能か確認
    if (!fsPromises) {
      console.warn('fsPromisesモジュールが読み込めません。ファイル削除操作はスキップされます。')
      return
    }

    try {
      await fsPromises.unlink(filePath)
    } catch (error: any) {
      // ファイルが存在しないエラー(ENOENT)は無視して良い
      if (error.code !== 'ENOENT') {
        console.error(`一時ファイルの削除中にエラーが発生しました: ${filePath}`, error)
      }
    }
  }

  /**
   * BlobURLを作成して追跡対象に追加
   * @param blob Blobオブジェクト
   * @param type MIMEタイプ（デフォルトはaudio/wav）
   * @returns 作成したBlobURL
   */
  public createBlobUrl(blob: Blob): string {
    // Blobのtype属性が空または不適切な場合は、適切なMIMEタイプを設定
    if (!blob.type || blob.type === 'audio/x-wav') {
      // WAVファイル形式に適したMIMEタイプをブラウザ互換性を考慮して設定
      const tempBlob = new Blob([blob], {
        type: 'audio/wav; codecs=1',
      })
      const url = URL.createObjectURL(tempBlob)
      this.blobUrls.add(url)
      return url
    }
    // すでに適切なtype属性がある場合はそのまま使用
    const url = URL.createObjectURL(blob)
    this.blobUrls.add(url)
    return url
  }

  /**
   * BlobURLを解放して追跡対象から削除
   * @param url 解放するBlobURL
   */
  public releaseBlobUrl(url: string): void {
    if (this.blobUrls.has(url)) {
      URL.revokeObjectURL(url)
      this.blobUrls.delete(url)
    } else if (url.startsWith('blob:')) {
      // 追跡対象になくてもblobURLと思われる場合は解放を試みる
      URL.revokeObjectURL(url)
    }
  }

  /**
   * 全てのBlobURLを解放
   */
  public releaseAllBlobUrls(): void {
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url)
    }
    this.blobUrls.clear()
  }

  /**
   * バイナリーデータを一時ファイルに保存
   * @param audioData 音声バイナリーデータ
   * @param filename ファイル名（オプション、ブラウザ環境でのダウンロード時に使用）
   * @returns 保存した一時ファイルのパス、またはブラウザ環境ではblobURL
   */
  public async saveTempAudioFile(audioData: ArrayBuffer, filename?: string): Promise<string> {
    try {
      if (isBrowser()) {
        // ブラウザ環境ではBlobとURLを作成して返す（ダウンロードを実行しない）
        // 一般的なブラウザで最も広くサポートされているMIMEタイプを使用
        const blob = new Blob([audioData], { type: 'audio/wav' })
        return this.createBlobUrl(blob)
      }

      // Node.jsモジュールが利用可能か確認
      if (!fsPromises) {
        throw new Error('fsPromisesモジュールが読み込めません。Node.js環境で実行されていることを確認してください。')
      }

      // Node.js環境ではファイルに保存
      const tempFilePath = this.createTempFilePath()
      const data = arrayBufferToUint8Array(audioData)
      await fsPromises.writeFile(tempFilePath, data)
      return tempFilePath
    } catch (error) {
      throw handleError('音声ファイルの保存に失敗しました', error)
    }
  }

  /**
   * バイナリーデータを指定されたパスに保存
   * @param audioData 音声バイナリーデータ
   * @param output 出力ファイルパスまたは出力ディレクトリ
   * @param forceDownload ブラウザ環境でも強制的にダウンロードを行う（デフォルトはtrue）
   * @returns 保存したファイルのパス、またはブラウザ環境ではダウンロードの結果またはblobURL
   */
  public async saveAudioFile(audioData: ArrayBuffer, output: string, forceDownload = true): Promise<string> {
    try {
      if (isBrowser()) {
        // ブラウザ環境
        const blob = new Blob([audioData], { type: 'audio/wav' })
        const filename = output || `voice-${uuidv4()}.wav`

        // forceDownloadフラグがtrueの場合のみダウンロードを実行
        if (forceDownload) {
          return this.browserDownloadFile(blob, filename)
        }
        // 強制ダウンロードでない場合はblobURLを返す
        return this.createBlobUrl(blob)
      }

      // Node.jsモジュールが利用可能か確認
      if (!fsPromises || !path) {
        throw new Error(
          '必要なNode.jsモジュール（fsPromises, path）が読み込めません。Node.js環境で実行されていることを確認してください。'
        )
      }

      // Node.js環境での処理
      // 出力が実際にディレクトリかファイルパスか判断
      let targetPath = output
      let isDir = false

      try {
        const outputStat = await fsPromises.stat(output)
        isDir = outputStat.isDirectory()
      } catch (err) {
        // ファイルまたはディレクトリが存在しない場合
        // 末尾がスラッシュで終わる場合はディレクトリと見なす
        isDir = output.endsWith('/') || output.endsWith('\\')
      }

      // ディレクトリの場合、ファイル名を生成
      if (isDir) {
        const filename = `voice-${uuidv4()}.wav`
        targetPath = path.join(output, filename)
      }

      // 出力ディレクトリが存在するか確認し、存在しない場合は作成
      await fsPromises.mkdir(path.dirname(targetPath), { recursive: true })

      // 音声データを指定された出力先に書き込み
      const data = arrayBufferToUint8Array(audioData)
      await fsPromises.writeFile(targetPath, data)

      return targetPath
    } catch (error) {
      throw handleError('音声ファイルの保存に失敗しました', error)
    }
  }

  /**
   * ブラウザ環境でのファイルダウンロード共通処理
   * 複数のダウンロード検知メカニズムを組み合わせて信頼性を向上
   * @param blob ダウンロードするデータ
   * @param filename ファイル名
   * @returns ダウンロードしたファイル名
   */
  private browserDownloadFile(blob: Blob, filename: string): Promise<string> {
    return new Promise<string>((resolve) => {
      // URL作成（追跡システムを使用）
      const url = this.createBlobUrl(blob)

      // aタグを作成してダウンロードを実行
      const a = document.createElement('a')
      // ユーザーから隠す
      a.style.display = 'none'
      a.href = url
      a.download = filename

      // ダウンロードをトラッキングするためのフラグ
      let isDownloadHandled = false

      // クリーンアップ処理
      const cleanup = () => {
        if (isDownloadHandled) return
        isDownloadHandled = true

        // 各種イベントリスナーを削除
        window.removeEventListener('focus', handleFocus)
        window.removeEventListener('blur', handleBlur)
        document.removeEventListener('visibilitychange', handleVisibilityChange)

        // もしブラウザがdownload属性のcompleteイベントをサポートしていれば削除
        if (a.onanimationstart) {
          a.onanimationstart = null
        }

        // フォールバックタイマーをクリア
        if (fallbackTimer) {
          clearTimeout(fallbackTimer)
        }

        // DOMからの削除と後処理
        if (document.body.contains(a)) {
          document.body.removeChild(a)
        }

        // URLを解放（追跡システムを使用）
        setTimeout(() => {
          this.releaseBlobUrl(url)
        }, 100)

        // 完了を通知
        resolve(filename)
      }

      // 複数のダウンロード検知メカニズム

      // 1. focus/blurイベント - ブラウザがダウンロードダイアログを表示/非表示する際に発火することがある
      const handleFocus = () => {
        // フォーカスイベントが発生したらダウンロードが始まった可能性が高い
        setTimeout(cleanup, 300)
      }

      const handleBlur = () => {
        // ブラウザによってはblurイベントが発生する場合もある
        setTimeout(cleanup, 300)
      }

      // 2. visibilitychangeイベント - ダウンロードダイアログが表示されると発生することがある
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' || document.visibilityState === 'visible') {
          setTimeout(cleanup, 300)
        }
      }

      // 3. animation hack - Safariなど一部のブラウザで動作する可能性がある
      // CSSアニメーションを使用してダウンロード開始を検知する試み
      try {
        // スタイルを追加
        const style = document.createElement('style')
        style.textContent = `
          @keyframes downloadStart {
            from { opacity: 0.99; }
            to { opacity: 1; }
          }
          .download-animation {
            animation-duration: 0.1s;
            animation-name: downloadStart;
          }
        `
        document.head.appendChild(style)

        // アニメーションクラスを追加
        a.classList.add('download-animation')

        // アニメーション開始イベントを監視
        a.onanimationstart = () => {
          document.head.removeChild(style)
          setTimeout(cleanup, 300)
        }
      } catch (e) {
        // アニメーションhackが失敗しても問題ない
        console.debug('Animation hack for download detection not supported')
      }

      // 各種イベントを登録
      window.addEventListener('focus', handleFocus)
      window.addEventListener('blur', handleBlur)
      document.addEventListener('visibilitychange', handleVisibilityChange)

      // bodyに追加して強制的にクリック
      document.body.appendChild(a)
      a.click()

      // 最終的なフォールバックタイマー (1.5秒後に強制的にクリーンアップ)
      const fallbackTimer = setTimeout(cleanup, 1500)
    })
  }
}
