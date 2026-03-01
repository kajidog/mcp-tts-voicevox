import type { AudioQuery, SpeakResult } from './types.js'

/**
 * マルチスピーカーテキスト "1:Hello\n2:World" をパースする
 */
export const parseStringInput = (input: string): Array<{ text: string; speaker?: number }> => {
  // \n と \\n の両方に対応するため、まず \\n を \n に変換してから分割
  const normalizedInput = input.replace(/\\n/g, '\n')
  const lines = normalizedInput.split('\n').filter((line) => line.trim())
  return lines.map((line) => {
    const match = line.match(/^(\d+):(.*)$/)
    if (match) {
      return { text: match[2].trim(), speaker: Number.parseInt(match[1], 10) }
    }
    return { text: line }
  })
}

/**
 * SpeakResult を人間が読める文字列にフォーマットする
 */
export const formatSpeakResponse = (result: SpeakResult): string => {
  if (result.status === 'error') {
    return `Error: ${result.errorMessage}`
  }

  const statusLabel = result.status === 'played' ? 'Played' : 'Queued'
  const moreSegments = result.segmentCount > 1 ? ` +${result.segmentCount - 1} more` : ''

  return `${statusLabel} (${result.mode}): "${result.textPreview}"${moreSegments}`
}

/**
 * JSON 文字列を AudioQuery にパースする
 */
export const parseAudioQuery = (query: string, speedScale?: number): AudioQuery => {
  const audioQuery = JSON.parse(query) as AudioQuery
  if (speedScale !== undefined) {
    audioQuery.speedScale = speedScale
  }
  return audioQuery
}

/**
 * テキストを自然な区切りで分割します
 * @param text 分割するテキスト
 * @param maxLength セグメントの最大長
 * @returns 分割されたテキストの配列
 */
export function splitText(text: string, maxLength: number): string[] {
  // 文の区切りとなるパターン
  const sentenceEndings = /([。！？])/
  // 自然な区切りとなる接続詞や助詞
  const naturalBreaks =
    /([、しかし、でも、けれど、そして、また、または、それで、だから、ですから、そのため、したがって、ゆえに])/

  const segments: string[] = []
  let currentSegment = ''

  // 文を句読点で分割
  const sentences = text.split(sentenceEndings).reduce((acc, part, i, arr) => {
    if (i % 2 === 0) {
      // テキスト部分
      acc.push(part)
    } else {
      // 句読点部分 - 前のテキストと結合
      acc[acc.length - 1] += part
    }
    return acc
  }, [] as string[])

  // 文ごとに処理
  for (const sentence of sentences) {
    if (!sentence.trim()) continue

    // 現在のセグメントに追加してみる
    const potentialSegment = currentSegment + sentence

    // 最大長を超えないならそのまま追加
    if (potentialSegment.length <= maxLength) {
      currentSegment = potentialSegment
    } else {
      // 最大長を超える場合、naturalBreaksで分割を試みる
      const parts = sentence.split(naturalBreaks)

      // 分割パーツを処理
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part.trim()) continue

        // 現在のセグメントに追加してみる
        const newSegment = currentSegment + part

        // 最大長を超えるかチェック
        if (newSegment.length <= maxLength) {
          currentSegment = newSegment
        } else {
          // 既存のセグメントがあれば保存
          if (currentSegment.trim()) {
            segments.push(currentSegment.trim())
          }
          currentSegment = part
        }
      }
    }

    // 一文が終わったら保存判定
    if (currentSegment.length >= maxLength && currentSegment.trim()) {
      segments.push(currentSegment.trim())
      currentSegment = ''
    }
  }

  // 残りのテキストがあれば追加
  if (currentSegment.trim()) {
    segments.push(currentSegment.trim())
  }

  return segments
}

/**
 * ブラウザ環境かどうかを判定します
 * @returns ブラウザ環境の場合はtrue、それ以外の場合はfalse
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * テスト環境かどうかを判定します
 * @returns テスト環境の場合はtrue、それ以外の場合はfalse
 */
export function isTestEnvironment(): boolean {
  if (isBrowser()) {
    // ブラウザ環境ではテスト環境の判定方法を変更
    // 例: URLにtestパラメータがある場合など
    return window.location.href.includes('test=true')
  }

  // Node.js環境での判定
  try {
    const processEnv = typeof process !== 'undefined' ? process.env : {}
    return processEnv.NODE_ENV === 'test' || processEnv.VITEST !== undefined
  } catch (e) {
    return false
  }
}

/**
 * IE用の拡張Navigatorインターフェース
 */
interface IENavigator extends Navigator {
  msSaveOrOpenBlob?: (blob: Blob, fileName: string) => boolean
}

/**
 * ブラウザ環境でバイナリデータをダウンロードさせる
 * @param data バイナリデータ
 * @param filename ダウンロード時のファイル名
 * @param mimeType MIMEタイプ（デフォルトはaudio/wav）
 * @returns ダウンロードしたファイル名
 */
export function downloadBlob(data: ArrayBuffer | Blob, filename: string, mimeType = 'audio/wav'): Promise<string> {
  if (!isBrowser()) {
    return Promise.reject(new Error('この関数はブラウザ環境でのみ使用できます'))
  }

  return new Promise<string>((resolve, reject) => {
    try {
      // Blobオブジェクトを作成（既にBlobなら変換しない）
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })

      // URLを作成
      const url = URL.createObjectURL(blob)

      // IE11用のMS独自オブジェクトのチェック
      const ieNavigator = window.navigator as IENavigator
      if (ieNavigator.msSaveOrOpenBlob) {
        ieNavigator.msSaveOrOpenBlob(blob, filename)
        resolve(filename)
        return
      }

      // a要素を作成
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'

      // ダウンロード完了を検知するためのイベントリスナー
      const cleanup = () => {
        window.removeEventListener('focus', cleanup)
        if (document.body.contains(a)) {
          document.body.removeChild(a)
        }
        URL.revokeObjectURL(url)
        resolve(filename)
      }

      // Safari用の対応
      window.addEventListener('focus', cleanup)

      // bodyに追加してクリック
      document.body.appendChild(a)
      a.click()

      // フォールバックタイマー
      setTimeout(cleanup, 1000)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * ブラウザでblobから音声を再生
 * @param blob 音声データのBlob
 * @returns 再生中のAudio要素
 */
export function playBlobAudio(blob: Blob): HTMLAudioElement {
  if (!isBrowser()) {
    throw new Error('この関数はブラウザ環境でのみ使用できます')
  }

  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)

  // 再生終了時にURLを解放
  audio.onended = () => {
    URL.revokeObjectURL(url)
  }

  // エラー時にもURLを解放
  audio.onerror = () => {
    URL.revokeObjectURL(url)
  }

  // 再生開始
  audio.play().catch(console.error)
  return audio
}
