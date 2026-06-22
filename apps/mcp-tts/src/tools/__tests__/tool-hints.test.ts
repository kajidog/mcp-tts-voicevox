import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerGetPlayerStateTool } from '../player/get-player-state-tool.js'
import { registerSpeakTool } from '../speak.js'
import { registerSpeakerTools } from '../speakers.js'
import { buildNextHint, composeDescription, enabledToolRef, isToolEnabled } from '../tool-hints.js'
import type { ToolDeps } from '../types.js'

describe('tool-hints helpers', () => {
  describe('isToolEnabled / enabledToolRef', () => {
    it('returns the prefixed name when the tool is enabled', () => {
      const disabled = new Set<string>()
      expect(isToolEnabled(disabled, 'speak')).toBe(true)
      expect(enabledToolRef(disabled, 'speak')).toBe('voicevox_speak')
    })

    it('returns undefined when the tool is disabled (unprefixed name)', () => {
      const disabled = new Set(['speak_player'])
      expect(isToolEnabled(disabled, 'speak_player')).toBe(false)
      expect(enabledToolRef(disabled, 'speak_player')).toBeUndefined()
    })

    it('also matches the prefixed name in the disabled set', () => {
      const disabled = new Set(['voicevox_speak_player'])
      expect(enabledToolRef(disabled, 'speak_player')).toBeUndefined()
    })
  })

  describe('composeDescription', () => {
    it('drops falsy parts and joins with a single space', () => {
      expect(composeDescription('A.', false, undefined, 'B.')).toBe('A. B.')
    })
  })

  describe('buildNextHint', () => {
    it('includes only enabled tools', () => {
      const disabled = new Set(['get_player_state'])
      const hint = buildNextHint(disabled, [
        { name: 'resynthesize_player', label: 'edit a track' },
        { name: 'get_player_state', label: 'inspect state' },
      ])
      expect(hint).toBe('Next: voicevox_resynthesize_player (edit a track)')
      expect(hint).not.toContain('get_player_state')
    })

    it('returns an empty string when every step is disabled', () => {
      const disabled = new Set(['resynthesize_player', 'get_player_state'])
      const hint = buildNextHint(disabled, [
        { name: 'resynthesize_player', label: 'edit a track' },
        { name: 'get_player_state', label: 'inspect state' },
      ])
      expect(hint).toBe('')
    })
  })
})

const mockRegisterTool = vi.fn()

function createMockDeps(disabledTools: Set<string>): ToolDeps {
  return {
    server: { registerTool: mockRegisterTool } as any,
    voicevoxClient: {} as any,
    config: { defaultSpeaker: 1, defaultSpeedScale: 1.0 } as any,
    disabledTools,
    restrictions: { immediate: false, waitForStart: false, waitForEnd: false },
  }
}

function getDescription(toolName: string): string {
  const call = mockRegisterTool.mock.calls.find((c: any[]) => c[0] === toolName)
  expect(call).toBeDefined()
  return call![1].description as string
}

describe('disabled-tool guidance in descriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('speak description omits the player reference when the player group is disabled', () => {
    registerSpeakTool(createMockDeps(new Set(['speak_player'])))
    expect(getDescription('voicevox_speak')).not.toContain('speak_player')
  })

  it('speak description guides to the player when it is enabled', () => {
    registerSpeakTool(createMockDeps(new Set<string>()))
    expect(getDescription('voicevox_speak')).toContain('voicevox_speak_player')
  })

  it('get_speakers description omits the speak reference when speak is disabled', () => {
    registerSpeakerTools(createMockDeps(new Set(['speak'])))
    const desc = getDescription('voicevox_get_speakers')
    expect(desc).not.toContain('voicevox_speak')
    expect(desc).toContain('speaker parameter')
  })

  it('get_player_state description omits player tools disabled via the apps group', () => {
    registerGetPlayerStateTool(createMockDeps(new Set(['speak_player', 'resynthesize_player'])), {} as any)
    const desc = getDescription('voicevox_get_player_state')
    expect(desc).not.toContain('speak_player')
    expect(desc).not.toContain('resynthesize_player')
  })
})
