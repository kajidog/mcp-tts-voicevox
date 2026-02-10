import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getConfig, parseCliArgs, parseEnvVars, resetConfigCache } from '../config'

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
      const result = parseCliArgs(['--disable-tools', 'speak,generate_query'])
      expect(result.disabledTools).toEqual(['speak', 'generate_query'])
    })

    it('--disable-tools でスペースをトリムする', () => {
      const result = parseCliArgs(['--disable-tools', 'speak, generate_query , stop_speaker'])
      expect(result.disabledTools).toEqual(['speak', 'generate_query', 'stop_speaker'])
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
      expect(result.disabledTools).toEqual([])
      expect(result.httpMode).toBe(false)
      expect(result.httpPort).toBe(3000)
      expect(result.httpHost).toBe('0.0.0.0')
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
})
