/**
 * エラーハンドリングを行い、適切なエラーメッセージとともに例外をスローします
 * @param message エラーメッセージのプレフィックス
 * @param error 発生したエラー
 * @returns never（常に例外をスロー）
 */
export function handleError(message: string, error: unknown): never {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error(`${message}: ${errorMsg}`, error)
  throw new Error(`${message}: ${errorMsg}`)
}

/**
 * エラーハンドリングを行い、エラーメッセージを返します (例外をスローしない)
 * @param message エラーメッセージのプレフィックス
 * @param error 発生したエラー
 * @returns エラーメッセージ
 */
export function formatError(message: string, error: unknown): string {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error(`${message}: ${errorMsg}`, error)
  return `${message}: ${errorMsg}`
}

/**
 * VOICEVOX関連のエラーコード
 */
export enum VoicevoxErrorCode {
  API_CONNECTION_ERROR = 'api_connection_error',
  QUERY_GENERATION_ERROR = 'query_generation_error',
  SYNTHESIS_ERROR = 'synthesis_error',
  FILE_OPERATION_ERROR = 'file_operation_error',
  PLAYBACK_ERROR = 'playback_error',
  QUEUE_OPERATION_ERROR = 'queue_operation_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * VOICEVOXエラークラス
 */
export class VoicevoxError extends Error {
  code: VoicevoxErrorCode
  originalError?: unknown

  constructor(message: string, code: VoicevoxErrorCode = VoicevoxErrorCode.UNKNOWN_ERROR, originalError?: unknown) {
    super(message)
    this.name = 'VoicevoxError'
    this.code = code
    this.originalError = originalError
  }

  /**
   * エラー発生箇所とスタックトレースを含むエラーの詳細情報を取得
   */
  getDetailedMessage(): string {
    let details = `${this.message} [${this.code}]`

    if (this.originalError instanceof Error) {
      details += `\nOriginal Error: ${this.originalError.message}`
      if (this.originalError.stack) {
        details += `\nStack: ${this.originalError.stack}`
      }
    }

    return details
  }
}

/**
 * エラーハンドリングユーティリティ関数
 * アプリケーション全体で統一されたエラーハンドリングを提供
 */

/**
 * エラーをVoicevoxError形式に変換して例外をスロー
 */
export function throwVoicevoxError(
  message: string,
  code: VoicevoxErrorCode = VoicevoxErrorCode.UNKNOWN_ERROR,
  originalError?: unknown
): never {
  console.error(`[${code}] ${message}`, originalError)
  throw new VoicevoxError(message, code, originalError)
}

/**
 * APIエラーを処理
 */
export function handleApiError(message: string, error: unknown): never {
  return throwVoicevoxError(message, VoicevoxErrorCode.API_CONNECTION_ERROR, error)
}

/**
 * クエリ生成エラーを処理
 */
export function handleQueryGenerationError(message: string, error: unknown): never {
  return throwVoicevoxError(message, VoicevoxErrorCode.QUERY_GENERATION_ERROR, error)
}

/**
 * 音声合成エラーを処理
 */
export function handleSynthesisError(message: string, error: unknown): never {
  return throwVoicevoxError(message, VoicevoxErrorCode.SYNTHESIS_ERROR, error)
}

/**
 * ファイル操作エラーを処理
 */
export function handleFileError(message: string, error: unknown): never {
  return throwVoicevoxError(message, VoicevoxErrorCode.FILE_OPERATION_ERROR, error)
}

/**
 * 再生エラーを処理
 */
export function handlePlaybackError(message: string, error: unknown): never {
  return throwVoicevoxError(message, VoicevoxErrorCode.PLAYBACK_ERROR, error)
}

/**
 * キュー操作エラーを処理
 */
export function handleQueueError(message: string, error: unknown): never {
  return throwVoicevoxError(message, VoicevoxErrorCode.QUEUE_OPERATION_ERROR, error)
}
