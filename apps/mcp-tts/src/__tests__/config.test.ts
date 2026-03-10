import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getConfig,
  getConfigTemplate,
  getHelpText,
  parseCliArgs,
  parseConfigFile,
  parseEnvVars,
  resetConfigCache,
} from '../config'

describe('config module', () => {
  describe('parseCliArgs', () => {
    it('空の引数で空のオブジェクトを返す', () => {
      const result = parseCliArgs([])
      expect(result).toEqual({})
    })

    it('--url を正しくパースする', () => {
      const result = parseCliArgs(['--url', 'http://example.com:50021'])
      expect(result.voicevoxUrl).toBe('http://example.com:50021')
    })

    it('--speaker を正しくパースする', () => {
      const result = parseCliArgs(['--speaker', '3'])
      expect(result.defaultSpeaker).toBe(3)
    })

    it('--speed を正しくパースする', () => {
      const result = parseCliArgs(['--speed', '1.5'])
      expect(result.defaultSpeedScale).toBe(1.5)
    })

    it('--immediate を正しくパースする', () => {
      const result = parseCliArgs(['--immediate'])
      expect(result.defaultImmediate).toBe(true)
    })

    it('--no-immediate を正しくパースする', () => {
      const result = parseCliArgs(['--no-immediate'])
      expect(result.defaultImmediate).toBe(false)
    })

    it('--wait-for-start を正しくパースする', () => {
      const result = parseCliArgs(['--wait-for-start'])
      expect(result.defaultWaitForStart).toBe(true)
    })

    it('--no-wait-for-start を正しくパースする', () => {
      const result = parseCliArgs(['--no-wait-for-start'])
      expect(result.defaultWaitForStart).toBe(false)
    })

    it('--wait-for-end を正しくパースする', () => {
      const result = parseCliArgs(['--wait-for-end'])
      expect(result.defaultWaitForEnd).toBe(true)
    })

    it('--no-wait-for-end を正しくパースする', () => {
      const result = parseCliArgs(['--no-wait-for-end'])
      expect(result.defaultWaitForEnd).toBe(false)
    })

    it('--player-export を正しくパースする', () => {
      const result = parseCliArgs(['--player-export'])
      expect(result.playerExportEnabled).toBe(true)
    })

    it('--no-player-export を正しくパースする', () => {
      const result = parseCliArgs(['--no-player-export'])
      expect(result.playerExportEnabled).toBe(false)
    })

    it('--player-export-dir を正しくパースする', () => {
      const result = parseCliArgs(['--player-export-dir', '/tmp/my-exports'])
      expect(result.playerExportDir).toBe('/tmp/my-exports')
    })

    it('--player-state-file を正しくパースする', () => {
      const result = parseCliArgs(['--player-state-file', '/tmp/player-state.json'])
      expect(result.playerStateFile).toBe('/tmp/player-state.json')
    })

    it('--restrict-immediate を正しくパースする', () => {
      const result = parseCliArgs(['--restrict-immediate'])
      expect(result.restrictImmediate).toBe(true)
    })

    it('--restrict-wait-for-start を正しくパースする', () => {
      const result = parseCliArgs(['--restrict-wait-for-start'])
      expect(result.restrictWaitForStart).toBe(true)
    })

    it('--restrict-wait-for-end を正しくパースする', () => {
      const result = parseCliArgs(['--restrict-wait-for-end'])
      expect(result.restrictWaitForEnd).toBe(true)
    })

    it('--disable-tools を正しくパースする', () => {
      const result = parseCliArgs(['--disable-tools', 'speak,get_speaker_detail'])
      expect(result.disabledTools).toEqual(['speak', 'get_speaker_detail'])
    })

    it('--disable-tools でスペースをトリムする', () => {
      const result = parseCliArgs(['--disable-tools', 'speak, get_speaker_detail , stop_speaker'])
      expect(result.disabledTools).toEqual(['speak', 'get_speaker_detail', 'stop_speaker'])
    })

    it('--http を正しくパースする', () => {
      const result = parseCliArgs(['--http'])
      expect(result.httpMode).toBe(true)
    })

    it('--port を正しくパースする', () => {
      const result = parseCliArgs(['--port', '8080'])
      expect(result.httpPort).toBe(8080)
    })

    it('--host を正しくパースする', () => {
      const result = parseCliArgs(['--host', '127.0.0.1'])
      expect(result.httpHost).toBe('127.0.0.1')
    })

    it('--api-key を正しくパースする', () => {
      const result = parseCliArgs(['--api-key', 'test-key'])
      expect(result.apiKey).toBe('test-key')
    })

    it('複数の引数を正しくパースする', () => {
      const result = parseCliArgs([
        '--url',
        'http://example.com:50021',
        '--speaker',
        '5',
        '--immediate',
        '--restrict-wait-for-end',
        '--http',
        '--port',
        '3001',
      ])
      expect(result.voicevoxUrl).toBe('http://example.com:50021')
      expect(result.defaultSpeaker).toBe(5)
      expect(result.defaultImmediate).toBe(true)
      expect(result.restrictWaitForEnd).toBe(true)
      expect(result.httpMode).toBe(true)
      expect(result.httpPort).toBe(3001)
    })

    it('値が必要な引数で値がない場合はスキップする', () => {
      const result = parseCliArgs(['--url', '--speaker', '3'])
      expect(result.voicevoxUrl).toBeUndefined()
      expect(result.defaultSpeaker).toBe(3)
    })
  })

  describe('parseEnvVars', () => {
    it('空の環境変数で空のオブジェクトを返す', () => {
      const result = parseEnvVars({})
      expect(result).toEqual({})
    })

    it('VOICEVOX_URL を正しく読み込む', () => {
      const result = parseEnvVars({ VOICEVOX_URL: 'http://example.com:50021' })
      expect(result.voicevoxUrl).toBe('http://example.com:50021')
    })

    it('VOICEVOX_DEFAULT_SPEAKER を正しく読み込む', () => {
      const result = parseEnvVars({ VOICEVOX_DEFAULT_SPEAKER: '3' })
      expect(result.defaultSpeaker).toBe(3)
    })

    it('VOICEVOX_DEFAULT_SPEED_SCALE を正しく読み込む', () => {
      const result = parseEnvVars({ VOICEVOX_DEFAULT_SPEED_SCALE: '1.5' })
      expect(result.defaultSpeedScale).toBe(1.5)
    })

    it('VOICEVOX_DEFAULT_IMMEDIATE=false で false を返す', () => {
      const result = parseEnvVars({ VOICEVOX_DEFAULT_IMMEDIATE: 'false' })
      expect(result.defaultImmediate).toBe(false)
    })

    it('VOICEVOX_DEFAULT_IMMEDIATE=true で true を返す', () => {
      const result = parseEnvVars({ VOICEVOX_DEFAULT_IMMEDIATE: 'true' })
      expect(result.defaultImmediate).toBe(true)
    })

    it('VOICEVOX_DEFAULT_WAIT_FOR_START=true で true を返す', () => {
      const result = parseEnvVars({ VOICEVOX_DEFAULT_WAIT_FOR_START: 'true' })
      expect(result.defaultWaitForStart).toBe(true)
    })

    it('VOICEVOX_DEFAULT_WAIT_FOR_END=true で true を返す', () => {
      const result = parseEnvVars({ VOICEVOX_DEFAULT_WAIT_FOR_END: 'true' })
      expect(result.defaultWaitForEnd).toBe(true)
    })

    it('VOICEVOX_RESTRICT_IMMEDIATE=true で true を返す', () => {
      const result = parseEnvVars({ VOICEVOX_RESTRICT_IMMEDIATE: 'true' })
      expect(result.restrictImmediate).toBe(true)
    })

    it('VOICEVOX_RESTRICT_WAIT_FOR_START=true で true を返す', () => {
      const result = parseEnvVars({ VOICEVOX_RESTRICT_WAIT_FOR_START: 'true' })
      expect(result.restrictWaitForStart).toBe(true)
    })

    it('VOICEVOX_RESTRICT_WAIT_FOR_END=true で true を返す', () => {
      const result = parseEnvVars({ VOICEVOX_RESTRICT_WAIT_FOR_END: 'true' })
      expect(result.restrictWaitForEnd).toBe(true)
    })

    it('VOICEVOX_PLAYER_EXPORT_ENABLED=false で false を返す', () => {
      const result = parseEnvVars({ VOICEVOX_PLAYER_EXPORT_ENABLED: 'false' })
      expect(result.playerExportEnabled).toBe(false)
    })

    it('VOICEVOX_PLAYER_EXPORT_DIR を正しく読み込む', () => {
      const result = parseEnvVars({ VOICEVOX_PLAYER_EXPORT_DIR: '/tmp/exports' })
      expect(result.playerExportDir).toBe('/tmp/exports')
    })

    it('VOICEVOX_PLAYER_STATE_FILE を正しく読み込む', () => {
      const result = parseEnvVars({ VOICEVOX_PLAYER_STATE_FILE: '/tmp/player-state.json' })
      expect(result.playerStateFile).toBe('/tmp/player-state.json')
    })

    it('VOICEVOX_DISABLED_TOOLS を正しく読み込む', () => {
      const result = parseEnvVars({ VOICEVOX_DISABLED_TOOLS: 'speak,generate_query' })
      expect(result.disabledTools).toEqual(['speak', 'generate_query'])
    })

    it('MCP_HTTP_MODE=true で true を返す', () => {
      const result = parseEnvVars({ MCP_HTTP_MODE: 'true' })
      expect(result.httpMode).toBe(true)
    })

    it('MCP_HTTP_PORT を正しく読み込む', () => {
      const result = parseEnvVars({ MCP_HTTP_PORT: '8080' })
      expect(result.httpPort).toBe(8080)
    })

    it('MCP_HTTP_HOST を正しく読み込む', () => {
      const result = parseEnvVars({ MCP_HTTP_HOST: '127.0.0.1' })
      expect(result.httpHost).toBe('127.0.0.1')
    })

    it('MCP_API_KEY を正しく読み込む', () => {
      const result = parseEnvVars({ MCP_API_KEY: 'env-key' })
      expect(result.apiKey).toBe('env-key')
    })

    it('空の数値環境変数はスキップする（0にならない）', () => {
      const result = parseEnvVars({
        MCP_HTTP_PORT: '',
        VOICEVOX_DEFAULT_SPEAKER: '',
        VOICEVOX_DEFAULT_SPEED_SCALE: '',
      })
      expect(result.httpPort).toBeUndefined()
      expect(result.defaultSpeaker).toBeUndefined()
      expect(result.defaultSpeedScale).toBeUndefined()
    })

    it('空の文字列環境変数はスキップする', () => {
      const result = parseEnvVars({
        VOICEVOX_URL: '',
        VOICEVOX_PLAYER_EXPORT_DIR: '',
      })
      expect(result.voicevoxUrl).toBeUndefined()
      expect(result.playerExportDir).toBeUndefined()
    })
  })

  describe('getConfig', () => {
    beforeEach(() => {
      resetConfigCache()
    })

    it('デフォルト値を返す', () => {
      const result = getConfig([], {})
      expect(result.voicevoxUrl).toBe('http://localhost:50021')
      expect(result.defaultSpeaker).toBe(1)
      expect(result.defaultSpeedScale).toBe(1.0)
      expect(result.defaultImmediate).toBe(true)
      expect(result.defaultWaitForStart).toBe(false)
      expect(result.defaultWaitForEnd).toBe(false)
      expect(result.restrictImmediate).toBe(false)
      expect(result.restrictWaitForStart).toBe(false)
      expect(result.restrictWaitForEnd).toBe(false)
      expect(result.playerExportEnabled).toBe(true)
      expect(result.playerExportDir).toContain('voicevox-player-exports')
      expect(result.playerCacheDir).toContain('.voicevox-player-cache')
      expect(result.playerStateFile).toContain('.voicevox-player-cache/player-state.json')
      expect(result.disabledTools).toEqual([])
      expect(result.httpMode).toBe(false)
      expect(result.httpPort).toBe(3000)
      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.apiKey).toBeUndefined()
    })

    it('環境変数がデフォルト値を上書きする', () => {
      const result = getConfig([], {
        VOICEVOX_URL: 'http://env.example.com:50021',
        VOICEVOX_DEFAULT_SPEAKER: '5',
      })
      expect(result.voicevoxUrl).toBe('http://env.example.com:50021')
      expect(result.defaultSpeaker).toBe(5)
    })

    it('CLI引数が環境変数を上書きする', () => {
      const result = getConfig(['--url', 'http://cli.example.com:50021', '--speaker', '10'], {
        VOICEVOX_URL: 'http://env.example.com:50021',
        VOICEVOX_DEFAULT_SPEAKER: '5',
      })
      expect(result.voicevoxUrl).toBe('http://cli.example.com:50021')
      expect(result.defaultSpeaker).toBe(10)
    })

    it('CLI引数がデフォルト値を上書きする', () => {
      const result = getConfig(['--no-immediate', '--wait-for-end'], {})
      expect(result.defaultImmediate).toBe(false)
      expect(result.defaultWaitForEnd).toBe(true)
    })

    it('player export の優先順位: CLI > ENV > デフォルト', () => {
      const result = getConfig(['--no-player-export', '--player-export-dir', '/tmp/cli-exports'], {
        VOICEVOX_PLAYER_EXPORT_ENABLED: 'true',
        VOICEVOX_PLAYER_EXPORT_DIR: '/tmp/env-exports',
      })
      expect(result.playerExportEnabled).toBe(false)
      expect(result.playerExportDir).toBe('/tmp/cli-exports')
    })

    it('player state file 未指定時は player cache dir に追従する', () => {
      const result = getConfig(['--player-cache-dir', '/tmp/cache-dir'], {})
      expect(result.playerCacheDir).toBe('/tmp/cache-dir')
      expect(result.playerStateFile).toBe('/tmp/cache-dir/player-state.json')
    })

    it('player state file 指定時は player cache dir より優先する', () => {
      const result = getConfig(['--player-cache-dir', '/tmp/cache-dir', '--player-state-file', '/tmp/state.json'], {})
      expect(result.playerCacheDir).toBe('/tmp/cache-dir')
      expect(result.playerStateFile).toBe('/tmp/state.json')
    })

    it('優先順位: CLI > ENV > デフォルト の順に設定される', () => {
      const result = getConfig(['--speaker', '100'], {
        VOICEVOX_URL: 'http://env.example.com:50021',
        VOICEVOX_DEFAULT_SPEAKER: '50',
      })
      // CLI引数があるのでCLI値
      expect(result.defaultSpeaker).toBe(100)
      // CLI引数がないので環境変数値
      expect(result.voicevoxUrl).toBe('http://env.example.com:50021')
      // 両方ないのでデフォルト値
      expect(result.defaultSpeedScale).toBe(1.0)
    })

    it('制限設定が正しく設定される', () => {
      const result = getConfig(['--restrict-immediate', '--restrict-wait-for-start'], {
        VOICEVOX_RESTRICT_WAIT_FOR_END: 'true',
      })
      expect(result.restrictImmediate).toBe(true)
      expect(result.restrictWaitForStart).toBe(true)
      expect(result.restrictWaitForEnd).toBe(true)
    })

    it('無効化ツールが正しく設定される', () => {
      const result = getConfig(['--disable-tools', 'speak,stop_speaker'], {})
      expect(result.disabledTools).toEqual(['speak', 'stop_speaker'])
    })
  })

  describe('parseConfigFile', () => {
    const tmpDir = join(process.cwd(), '__test_config_tmp__')

    beforeEach(() => {
      mkdirSync(tmpDir, { recursive: true })
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('存在しないファイルパスで空オブジェクトを返す', () => {
      const result = parseConfigFile('/tmp/non-existent-config.json')
      expect(result).toEqual({})
    })

    it('JSON設定ファイルを正しくパースする', () => {
      const configPath = join(tmpDir, 'test-config.json')
      writeFileSync(configPath, JSON.stringify({ url: 'http://test:50021', speaker: 5 }))
      const result = parseConfigFile(configPath)
      expect(result.voicevoxUrl).toBe('http://test:50021')
      expect(result.defaultSpeaker).toBe(5)
    })

    it('boolean値を正しくパースする', () => {
      const configPath = join(tmpDir, 'bool-config.json')
      writeFileSync(configPath, JSON.stringify({ immediate: false, 'wait-for-end': true }))
      const result = parseConfigFile(configPath)
      expect(result.defaultImmediate).toBe(false)
      expect(result.defaultWaitForEnd).toBe(true)
    })

    it('camelCaseキーを受け入れる', () => {
      const configPath = join(tmpDir, 'camel-config.json')
      writeFileSync(configPath, JSON.stringify({ useStreaming: true, autoPlay: false }))
      const result = parseConfigFile(configPath)
      expect(result.useStreaming).toBe(true)
      expect(result.autoPlay).toBe(false)
    })

    it('string[]型を正しくパースする', () => {
      const configPath = join(tmpDir, 'array-config.json')
      writeFileSync(configPath, JSON.stringify({ 'disable-tools': ['speak', 'stop_speaker'] }))
      const result = parseConfigFile(configPath)
      expect(result.disabledTools).toEqual(['speak', 'stop_speaker'])
    })

    it('不正なJSONファイルで空オブジェクトを返す', () => {
      const configPath = join(tmpDir, 'invalid-config.json')
      writeFileSync(configPath, 'not valid json{')
      const result = parseConfigFile(configPath)
      expect(result).toEqual({})
    })

    it('サーバー設定も正しくパースする', () => {
      const configPath = join(tmpDir, 'server-config.json')
      writeFileSync(configPath, JSON.stringify({ http: true, port: 8080 }))
      const result = parseConfigFile(configPath)
      expect(result.httpMode).toBe(true)
      expect(result.httpPort).toBe(8080)
    })

    it('空文字列のパスオプションはスキップする（ランタイムデフォルトを上書きしない）', () => {
      const configPath = join(tmpDir, 'empty-path-config.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          'player-export-dir': '',
          'player-cache-dir': '',
          'player-state-file': '',
        })
      )
      const result = parseConfigFile(configPath)
      expect(result.playerExportDir).toBeUndefined()
      expect(result.playerCacheDir).toBeUndefined()
      expect(result.playerStateFile).toBeUndefined()
    })
  })

  describe('getConfig with config file', () => {
    const tmpDir = join(process.cwd(), '__test_config_tmp2__')

    beforeEach(() => {
      resetConfigCache()
      mkdirSync(tmpDir, { recursive: true })
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('CLI > ENV > config file > デフォルト の優先順位', () => {
      const configPath = join(tmpDir, 'priority-config.json')
      writeFileSync(configPath, JSON.stringify({ url: 'http://file:50021', speaker: 10, speed: 2.0 }))
      const result = getConfig(['--config', configPath, '--speaker', '99'], {
        VOICEVOX_DEFAULT_SPEED_SCALE: '3.0',
      })
      // CLI引数が最優先
      expect(result.defaultSpeaker).toBe(99)
      // 環境変数が次
      expect(result.defaultSpeedScale).toBe(3.0)
      // 設定ファイルが次
      expect(result.voicevoxUrl).toBe('http://file:50021')
    })
  })

  describe('getHelpText', () => {
    it('help文が生成される', () => {
      const help = getHelpText()
      expect(help).toContain('Usage:')
      expect(help).toContain('--help')
      expect(help).toContain('--url')
      expect(help).toContain('--speaker')
      expect(help).toContain('--http')
      expect(help).toContain('--port')
      expect(help).toContain('--config')
    })

    it('グループごとに整理されている', () => {
      const help = getHelpText()
      expect(help).toContain('Voicevox Configuration:')
      expect(help).toContain('Playback Options:')
      expect(help).toContain('Server Options:')
    })

    it('Examplesが含まれる', () => {
      const help = getHelpText()
      expect(help).toContain('Examples:')
      expect(help).toContain('npx @kajidog/mcp-tts-voicevox')
    })
  })

  describe('getConfigTemplate', () => {
    it('デフォルトが未定義のオプションはテンプレートに含まれない', () => {
      const template = getConfigTemplate()
      // ランタイムデフォルトを持つパスオプションは含まれない
      expect(template).not.toHaveProperty('player-export-dir')
      expect(template).not.toHaveProperty('player-cache-dir')
      expect(template).not.toHaveProperty('player-state-file')
      // configFile は除外済み
      expect(template).not.toHaveProperty('config')
    })

    it('明示的なデフォルトを持つオプションは含まれる', () => {
      const template = getConfigTemplate()
      expect(template).toHaveProperty('url', 'http://localhost:50021')
      expect(template).toHaveProperty('speaker', 1)
      expect(template).toHaveProperty('speed', 1.0)
      expect(template).toHaveProperty('immediate', true)
    })
  })
})
