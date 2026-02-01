/**
 * セッションごとの設定を管理するモジュール
 * 循環参照を避けるため、独立したモジュールとして実装
 */

export interface SessionConfig {
  defaultSpeaker?: number
}

const sessionConfigs = new Map<string, SessionConfig>()

/**
 * セッション設定を保存
 */
export function setSessionConfig(sessionId: string, config: SessionConfig): void {
  sessionConfigs.set(sessionId, config)
}

/**
 * セッション設定を取得
 */
export function getSessionConfig(sessionId?: string): SessionConfig | undefined {
  if (!sessionId) return undefined
  return sessionConfigs.get(sessionId)
}

/**
 * セッション設定を削除
 */
export function deleteSessionConfig(sessionId: string): void {
  sessionConfigs.delete(sessionId)
}
