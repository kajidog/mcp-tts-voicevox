import { describe, expect, it, vi } from 'vitest'
import type { ToolDeps } from '../../types'
import { createPlayerUIToolContext } from '../context'
import type { PlayerUIShared } from '../types'

function makeDeps(): ToolDeps {
  return {
    server: {} as ToolDeps['server'],
    voicevoxClient: {} as ToolDeps['voicevoxClient'],
    config: {} as ToolDeps['config'],
    disabledTools: new Set(),
    restrictions: { immediate: false, waitForStart: false, waitForEnd: false },
  }
}

function makeShared(overrides: Partial<PlayerUIShared> = {}): PlayerUIShared {
  const setSessionState = vi.fn()
  return {
    playerVoicevoxApi: {} as PlayerUIShared['playerVoicevoxApi'],
    playerResourceUri: 'ui://test',
    synthesizeWithCache: vi.fn(async () => {
      throw new Error('unused')
    }),
    setSessionState,
    getSessionState: vi.fn(),
    getSpeakerList: vi.fn(async () => [
      { id: 1, name: 'ノーマル', characterName: 'ずんだもん', uuid: 'uuid-1' },
      { id: 3, name: 'あまあま', characterName: '四国めたん', uuid: 'uuid-2' },
    ]),
    ...overrides,
  }
}

describe('createPlayerUIToolContext', () => {
  it('saveStateForViewAndSession は stateKey と sessionId に保存する', () => {
    const shared = makeShared()
    const context = createPlayerUIToolContext(makeDeps(), shared)
    const state = { segments: [{ text: 'a', speaker: 1, speedScale: 1 }], updatedAt: Date.now() }

    context.saveStateForViewAndSession('view-1', 'session-1', state)

    expect(shared.setSessionState).toHaveBeenCalledTimes(2)
    expect(shared.setSessionState).toHaveBeenNthCalledWith(1, 'view-1', state)
    expect(shared.setSessionState).toHaveBeenNthCalledWith(2, 'session-1', state)
  })

  it('sessionId が stateKey と同じ場合は1回だけ保存する', () => {
    const shared = makeShared()
    const context = createPlayerUIToolContext(makeDeps(), shared)
    const state = { segments: [{ text: 'a', speaker: 1, speedScale: 1 }], updatedAt: Date.now() }

    context.saveStateForViewAndSession('same-key', 'same-key', state)
    expect(shared.setSessionState).toHaveBeenCalledTimes(1)
  })

  it('resolveSpeakerNameMap は重複を除外し未定義speakerにdefaultSpeakerを使う', async () => {
    const shared = makeShared()
    const context = createPlayerUIToolContext(makeDeps(), shared)

    const map = await context.resolveSpeakerNameMap(
      [{ speaker: 1 }, { speaker: 1 }, { speaker: undefined }, { speaker: 99 }],
      3
    )

    expect(map.get(1)).toBe('ずんだもん（ノーマル）')
    expect(map.get(3)).toBe('四国めたん（あまあま）')
    expect(map.get(99)).toBe('Speaker 99')
    expect(shared.getSpeakerList).toHaveBeenCalledTimes(1)
  })
})
