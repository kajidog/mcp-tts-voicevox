import { describe, expect, it } from 'vitest'
import { decodeWavBase64, isWavBuffer } from '../wav.js'

function wavBase64(): string {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  return header.toString('base64')
}

describe('isWavBuffer', () => {
  it('RIFF/WAVE ヘッダを持つデータを WAV と判定する', () => {
    expect(isWavBuffer(Buffer.from(wavBase64(), 'base64'))).toBe(true)
  })

  it('短すぎるデータは WAV ではない', () => {
    expect(isWavBuffer(Buffer.from('RIFF'))).toBe(false)
  })

  it('RIFF だが WAVE ではないデータ（例: RIFF/AVI）は WAV ではない', () => {
    const buf = Buffer.alloc(12)
    buf.write('RIFF', 0, 'ascii')
    buf.write('AVI ', 8, 'ascii')
    expect(isWavBuffer(buf)).toBe(false)
  })
})

describe('decodeWavBase64', () => {
  it('WAV ならデコード結果を返す', () => {
    const buffer = decodeWavBase64(wavBase64(), 'track 1')
    expect(buffer.length).toBe(44)
  })

  it('WAV でなければ明確なエラーで拒否する', () => {
    const notWav = Buffer.from('#!/bin/sh\necho pwned\n').toString('base64')
    expect(() => decodeWavBase64(notWav, 'track 2')).toThrowError(/track 2/)
    expect(() => decodeWavBase64(notWav, 'track 2')).toThrowError(/RIFF\/WAVE/)
  })

  it('空文字列も拒否する', () => {
    expect(() => decodeWavBase64('', 'track 1')).toThrowError(/not a WAV file/)
  })
})
