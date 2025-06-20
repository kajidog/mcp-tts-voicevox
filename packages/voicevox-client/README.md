# @kajidog/voicevox-client

A TypeScript client library for VOICEVOX text-to-speech synthesis engine.

## Installation

```bash
npm install @kajidog/voicevox-client
```

## Basic Usage

```typescript
import { VoicevoxClient } from '@kajidog/voicevox-client';

// Initialize client
const client = new VoicevoxClient({
  url: 'http://localhost:50021',
  defaultSpeaker: 1,
  defaultSpeedScale: 1.0
});

// Simple text-to-speech
await client.speak('こんにちは');

// Generate audio file
const filePath = await client.generateAudioFile('テストメッセージ', './output.wav');

// Get available speakers
const speakers = await client.getSpeakers();
```

## Features

- **Text-to-Speech Synthesis**: Convert text to speech with multiple speaker voices
- **Audio Queue Management**: Efficient queue-based audio processing and playback
- **Cross-platform Audio Playback**: Native audio playback support without external dependencies
  - **macOS**: Uses built-in `afplay` command
  - **Windows**: Uses PowerShell MediaPlayer with optimized timing
  - **Linux**: Auto-detects available players (`aplay`, `paplay`, `play`, `ffplay`)
- **File Generation**: Generate WAV audio files from text
- **Speaker Management**: Get information about available speakers and voices
- **Flexible Input**: Support for single text, text arrays, and speech segments
- **Lightweight**: No external audio dependencies - uses platform-native tools

## API Reference

### VoicevoxClient

Main client class for interacting with VOICEVOX engine.

#### Constructor
```typescript
new VoicevoxClient(config: VoicevoxConfig)
```

#### Methods

- `speak(text: string | string[] | SpeechSegment[], speaker?: number, speedScale?: number): Promise<string>`
- `generateQuery(text: string, speaker?: number, speedScale?: number): Promise<AudioQuery>`
- `generateAudioFile(textOrQuery: string | AudioQuery, outputPath?: string, speaker?: number, speedScale?: number): Promise<string>`
- `getSpeakers(): Promise<Speaker[]>`
- `getSpeakerInfo(uuid: string): Promise<SpeakerInfo>`
- `clearQueue(): Promise<void>`

## Audio Requirements

The package uses platform-native audio tools for playback:

- **macOS**: No additional setup required (uses built-in `afplay`)
- **Windows**: No additional setup required (uses PowerShell)
- **Linux**: Requires one of the following audio players:
  - `aplay` (ALSA)
  - `paplay` (PulseAudio)
  - `play` (SoX)
  - `ffplay` (FFmpeg)

## Development

This package is part of the MCP VOICEVOX project. For development:

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests (includes audio playback mocking)
npm test

# Type checking
npm run lint
```

## License

MIT License