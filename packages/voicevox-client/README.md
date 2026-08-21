# @kajidog/voicevox-client

A TypeScript client library for the VOICEVOX text-to-speech engine.

ESM only, with **zero runtime dependencies** — it uses the platform's `fetch` and
`crypto.randomUUID`. Runs on Node.js >= 18 and in the browser.

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
await client.speak('Hello, world!');

// With options
await client.speak('Hello, world!', {
  speaker: 3,
  speedScale: 1.2,
  waitForEnd: true  // Wait for playback to complete
});

// Generate audio file
const filePath = await client.generateAudioFile('Test message', './output.wav');

// Get available speakers
const speakers = await client.getSpeakers();
```

## Features

- **Text-to-Speech Synthesis**: Convert text to speech with multiple speaker voices
- **Audio Queue Management**: Efficient queue-based audio processing and playback
- **Streaming Playback**: Direct buffer playback via ffplay (no temp files)
- **Cross-platform Audio Playback**: Native audio playback support without external dependencies
  - **macOS**: Uses built-in `afplay` command
  - **Windows**: Uses PowerShell MediaPlayer with optimized timing
  - **Linux**: Auto-detects available players (`aplay`, `paplay`, `play`, `ffplay`)
- **File Generation**: Generate WAV audio files from text
- **Speaker Management**: Get information about available speakers and voices
- **Flexible Input**: Support for single text, text arrays, and speech segments
- **Advanced Playback Control**: Immediate playback, synchronous/asynchronous control
- **Prefetching**: Look-ahead synthesis of queued items for gapless playback
- **Retry & Timeout**: Configurable retry with exponential backoff and a per-request timeout
- **User Dictionary**: Read and edit the VOICEVOX user dictionary, with inline accent notation
- **Lightweight**: No runtime dependencies - uses platform-native tools

## API Reference

### VoicevoxClient

Main client class for interacting with VOICEVOX engine.

#### Constructor

```typescript
new VoicevoxClient(config: VoicevoxConfig)
```

**VoicevoxConfig:**

```typescript
interface VoicevoxConfig {
  url: string;                    // VOICEVOX engine URL (required)
  defaultSpeaker: number;         // Default speaker ID (required)
  defaultSpeedScale?: number;     // Default playback speed (default: 1.0)
  defaultVolumeScale?: number;    // Default volume (0.0 - 2.0, default: 1.0)
  defaultPitchScale?: number;     // Default pitch (-0.15 - 0.15, default: 0.0)
  defaultPrePhonemeLength?: number;   // Silence before each segment (seconds)
  defaultPostPhonemeLength?: number;  // Silence after each segment (seconds)
  maxSegmentLength?: number;      // Max characters per split segment (default: 150)
  retryCount?: number;            // Retries per failed API request (0 disables, default: 2)
  retryDelayMs?: number;          // Initial retry delay, exponential backoff (default: 250)
  timeoutMs?: number;             // Per-request timeout in ms (default: 30000)
  prefetchSize?: number;          // Max look-ahead items to synthesize (default: 2)
  defaultPlaybackOptions?: PlaybackOptions;  // Default playback options
  useStreaming?: boolean;         // true: ffplay streaming, false: temp file playback,
                                  // undefined: env var / auto-detect
}
```

#### Methods

##### speak

Convert text to speech and play it.

```typescript
speak(
  input: string | string[] | SpeechSegment[],
  options?: SpeakOptions
): Promise<SpeakResult>
```

**SpeakResult:**

```typescript
interface SpeakResult {
  status: 'queued' | 'playing' | 'played' | 'error';
  mode: 'streaming' | 'file';
  textPreview: string;
  segmentCount: number;
  errorMessage?: string;  // Set when status is 'error'
}
```

**SpeakOptions:**

```typescript
interface SpeakOptions {
  speaker?: number;        // Speaker ID
  speedScale?: number;     // Playback speed
  immediate?: boolean;     // Start playback immediately (default: true)
  waitForStart?: boolean;  // Wait for playback to start (default: false)
  waitForEnd?: boolean;    // Wait for playback to end (default: false)
  pitchScale?: number;     // Pitch (-0.15 to 0.15)
  intonationScale?: number;// Intonation (0.0 to 2.0)
  volumeScale?: number;    // Volume (0.0 to 2.0)
  prePhonemeLength?: number; // Pre-phoneme silence (seconds)
  postPhonemeLength?: number;// Post-phoneme silence (seconds)
}
```

**Examples:**

```typescript
// Simple text
await client.speak('Hello');

// Multiple texts as array
await client.speak(['Hello', 'How are you?']);

// Speech segments with different speakers
await client.speak([
  { text: 'Hello', speaker: 1 },
  { text: 'Nice to meet you', speaker: 3 }
]);

// With options
await client.speak('Important message', {
  speaker: 2,
  speedScale: 1.5,
  immediate: true,
  waitForEnd: true
});
// With detailed audio parameters
await client.speak('Custom voice settings', {
  pitchScale: 0.1,        // Higher pitch
  intonationScale: 1.5,   // More intonation
  prePhonemeLength: 0.5,  // Add silence before
  postPhonemeLength: 1.0  // Add silence after
});
```

##### generateQuery

Generate an AudioQuery for voice synthesis.

```typescript
generateQuery(
  text: string,
  speaker?: number,
  speedScale?: number
): Promise<AudioQuery>
```

##### generateAudioFile

Generate an audio file from text or AudioQuery.

```typescript
generateAudioFile(
  textOrQuery: string | AudioQuery,
  outputPath?: string,
  speaker?: number,
  speedScale?: number
): Promise<string>
```

##### enqueueAudioGeneration

Add text or query to the audio generation queue.

```typescript
enqueueAudioGeneration(
  input: string | string[] | SpeechSegment[] | AudioQuery,
  options?: SpeakOptions
): Promise<SpeakResult>
```

##### Other Methods

- `getSpeakers(): Promise<Speaker[]>` - Get list of available speakers
- `getSpeakerInfo(uuid: string): Promise<SpeakerInfo>` - Get speaker details
- `checkHealth(): Promise<{ connected: boolean; version?: string; url: string }>` - Check the engine connection
- `clearQueue(): Promise<void>` - Clear the playback queue
- `startPlayback(): void` - Start queue playback
- `pausePlayback(): void` - Pause queue playback
- `resumePlayback(): void` - Resume queue playback
- `getQueueLength(): number` - Get number of items in queue
- `isQueueEmpty(): boolean` - Check if queue is empty
- `isPlaying(): boolean` - Check if currently playing
- `getQueueService(): QueueService` - Access the underlying queue service

##### User Dictionary

All dictionary methods return the full dictionary after the change, as
`NormalizedDictionaryWord[]` (`{ wordUuid, surface, pronunciation, accentType, notation, priority }`).

- `getDictionary(): Promise<NormalizedDictionaryWord[]>`
- `addDictionaryWord(input: DictionaryWordInput): Promise<NormalizedDictionaryWord[]>`
- `addDictionaryWords(inputs: DictionaryWordInput[]): Promise<NormalizedDictionaryWord[]>`
- `updateDictionaryWord(input: DictionaryWordUpdateInput): Promise<NormalizedDictionaryWord[]>`
- `updateDictionaryWords(inputs: DictionaryWordUpdateInput[]): Promise<NormalizedDictionaryWord[]>`
- `deleteDictionaryWord(wordUuid: string): Promise<NormalizedDictionaryWord[]>`
- `getAccentNotation(text, speaker?): Promise<{ notation: string; accentPhrases: AccentPhrase[] }>`

```typescript
interface DictionaryWordInput {
  surface: string;         // The text to match
  pronunciation: string;   // Katakana, with optional inline accent notation
  accentType?: number;     // Derived from the notation when omitted
  priority?: number;
  wordType?: string;
}

// DictionaryWordUpdateInput is the same, with a required `wordUuid`
// and every other field optional (omitted fields keep their value).
```

## Inline Accent Notation

Pronunciations are exchanged as katakana with an inline accent marker: `,`
separates accent phrases and `[` marks where the pitch drops after.

```typescript
// Read back what the engine estimates for a text
const { notation } = await client.getAccentNotation('こんにちは世界');
// -> "コン[ニ]チワ,セ[カ]イ"

// Register a word with an explicit accent
await client.addDictionaryWord({
  surface: 'VOICEVOX',
  pronunciation: 'ボイス[ボッ]クス',
});
```

The notation helpers are exported for building your own queries:

```typescript
import {
  accentPhrasesToNotation,  // AccentPhrase[] -> notation string
  parseNotation,            // notation string -> ParsedPhrase[]
  applyNotationAccents,     // apply parsed accents onto an AudioQuery's accent phrases
} from '@kajidog/voicevox-client';

const query = await client.generateQuery('こんにちは世界');
query.accent_phrases = applyNotationAccents(
  parseNotation('コン[ニ]チワ,セ[カ]イ'),
  query.accent_phrases,
  query.accent_phrases
);
await client.enqueueAudioGeneration(query);
```

Phrases whose brackets are omitted keep the engine's own accent estimation.

## Playback Options

### Immediate Playback (`immediate: true`)

Clear existing queue and play audio immediately:

```typescript
// Stops current playback, clears queue, and plays new audio
await client.speak('Urgent notification', {
  immediate: true,
  waitForEnd: true
});
```

### Synchronous Playback (`waitForEnd: true`)

Wait for playback to complete before continuing:

```typescript
// Step-by-step audio guide
await client.speak('Step 1: Open the file', { waitForEnd: true });
await client.speak('Step 2: Click the button', { waitForEnd: true });
```

### Queue-based Playback (`immediate: false`)

Add to queue without auto-starting:

```typescript
client.speak('First message', { immediate: false });
client.speak('Second message', { immediate: false });
client.startPlayback();  // Start playing queue
```

## Streaming Playback

When `ffplay` is available, the library can play audio directly from memory without creating temporary files:

- Faster first audio playback (no disk I/O)
- Reduced disk usage
- Can be disabled via environment variable: `VOICEVOX_STREAMING_PLAYBACK=false`

## Audio Requirements

The package uses platform-native audio tools for playback:

- **macOS**: No additional setup required (uses built-in `afplay`)
- **Windows**: No additional setup required (uses PowerShell)
- **Linux**: Requires one of the following audio players:
  - `aplay` (ALSA)
  - `paplay` (PulseAudio)
  - `play` (SoX)
  - `ffplay` (FFmpeg)

For streaming playback (optional):
- Install `ffmpeg` which includes `ffplay`

## Environment Variables

The engine URL and the default speaker are constructor options, not environment
variables. Only the playback defaults are read from the environment (Node.js only),
and an explicit option always wins over them:

- `VOICEVOX_DEFAULT_IMMEDIATE`: Start playback immediately (default: `true`)
- `VOICEVOX_DEFAULT_WAIT_FOR_START`: Wait for playback start (default: `false`)
- `VOICEVOX_DEFAULT_WAIT_FOR_END`: Wait for playback end (default: `false`)
- `VOICEVOX_STREAMING_PLAYBACK`: Enable streaming playback when `useStreaming` is unset (default: auto-detect)

## Development

This package is part of the MCP VOICEVOX project. For development:

The monorepo uses **pnpm**; run these from the repository root or with a filter.

```bash
# Install dependencies (repository root)
pnpm install

# Build the package
pnpm --filter @kajidog/voicevox-client build

# Run tests (audio playback is mocked)
pnpm --filter @kajidog/voicevox-client test

# Type checking and linting
pnpm --filter @kajidog/voicevox-client typecheck
pnpm lint
```

## License

ISC
