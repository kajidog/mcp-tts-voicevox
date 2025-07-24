/**
 * Effect.ts configuration and infrastructure
 * Provides centralized setup for Effect-based components
 */

import { ConfigProvider, Context, Effect, Layer, LogLevel, Logger } from 'effect'

/**
 * Application configuration interface
 */
export interface AppConfig {
  readonly voicevoxUrl: string
  readonly defaultSpeaker: number
  readonly defaultSpeedScale: number
  readonly defaultImmediate: boolean
  readonly defaultWaitForStart: boolean
  readonly defaultWaitForEnd: boolean
  readonly prefetchSize: number
  readonly logLevel: LogLevel.LogLevel
}

/**
 * Default application configuration
 */
export const defaultConfig: AppConfig = {
  voicevoxUrl: process.env.VOICEVOX_URL || 'http://localhost:50021',
  defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER) || 1,
  defaultSpeedScale: Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE) || 1.0,
  defaultImmediate: process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false',
  defaultWaitForStart: process.env.VOICEVOX_DEFAULT_WAIT_FOR_START === 'true',
  defaultWaitForEnd: process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true',
  prefetchSize: Number(process.env.VOICEVOX_PREFETCH_SIZE) || 2,
  logLevel: LogLevel.Info,
}

/**
 * Application configuration context
 */
export const AppConfigContext = Context.GenericTag<AppConfig>('@voicevox/AppConfig')

/**
 * Layer providing the application configuration
 */
export const AppConfigLive = Layer.succeed(AppConfigContext, defaultConfig)

/**
 * Layer providing configuration from environment variables
 */
export const AppConfigFromEnv = Layer.effect(
  AppConfigContext,
  Effect.sync(() => defaultConfig)
)

/**
 * Logger configuration layer
 */
export const LoggerLive = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ logLevel, message }) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${logLevel}] ${message}`)
  })
)

/**
 * Main application layer combining all infrastructure
 */
export const AppLayer = Layer.mergeAll(AppConfigLive, LoggerLive)
