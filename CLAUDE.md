# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm**. Do not use npm or yarn.

### Build & Validate
- `pnpm build` - Build both packages with tsgo + fix shebang permissions
- `pnpm build:tsc` - Build with traditional tsc (fallback if tsgo fails)
- `pnpm run lint` - Biome check + TypeScript type checking (both packages)
- `pnpm test` - Run Vitest for both packages (136 + 56 tests)
- `pnpm run lint:fix` - Auto-fix lint/format issues

### Development
- `pnpm dev` - Start MCP server in stdio mode via tsx
- `pnpm dev:http` - Start MCP server in HTTP mode via tsx
- `pnpm dev:bun` - Start MCP server via Bun (TypeScript direct execution)

### Run a Single Test
- `pnpm vitest run src/__tests__/config.test.ts` - Run one test file from root
- `cd packages/voicevox-client && pnpm vitest run src/__tests__/prefetch.test.ts` - Run one test file from sub-package

### voicevox-client Sub-package
- `cd packages/voicevox-client && pnpm test` - Tests only
- `cd packages/voicevox-client && pnpm run lint` - Lint only (includes `tsc --noEmit`)
- `cd packages/voicevox-client && pnpm build` - Build only

## Architecture

VOICEVOX MCP server for text-to-speech. Two packages with strict separation:

### Two Packages

| Package | Path | Purpose | Runtime Dependencies |
|---------|------|---------|---------------------|
| `@kajidog/mcp-tts-voicevox` | `src/` | MCP server (stdio + HTTP modes) | MCP SDK, Hono, Zod, voicevox-client |
| `@kajidog/voicevox-client` | `packages/voicevox-client/` | Standalone TTS library (npm-publishable) | **Zero** (native fetch, crypto.randomUUID) |

### Module System: ESM Only

Both packages use `"type": "module"` with `module: NodeNext` in tsconfig. Key conventions:
- All relative imports **must** use `.js` extensions (e.g., `import { getConfig } from './config.js'`)
- No `require()` anywhere — use `await import()` for dynamic imports
- `scripts/fix-permissions.cjs` is the only CJS file (needed for build script)
- Use `import.meta.url` instead of `__dirname`/`__filename`

### MCP Server (`src/`)

- **`index.ts`** - Entry point with runtime detection (Node.js/Bun), CLI arg parsing, auto-starts stdio or HTTP server. Reads `package.json` via `readFileSync` (no `require` for JSON).
- **`config.ts`** - Unified config: CLI args > env vars > defaults. All VOICEVOX and server settings.
- **`server.ts`** - MCP tool registration via `server.registerTool()`. Tools: `ping_voicevox`, `speak`, `generate_query`, `synthesize_file`, `stop_speaker`, `get_speakers`. Uses `registerToolIfEnabled()` for conditional registration. Dynamic schema via `buildSpeakInputSchema()`.
- **`http.ts`** - Hono app with CORS, Origin/Host validation (MCP 2025-11-25 spec), session management via `WebStandardStreamableHTTPServerTransport`.
- **`stdio.ts`** - Minimal stdio transport wrapper.
- **`session.ts`** - Per-session speaker config storage (Map-based).

### VoicevoxClient Library (`packages/voicevox-client/src/`)

- **`client.ts`** - `VoicevoxClient` facade: `speak()`, `generateQuery()`, `generateAudioFile()`, queue management
- **`api.ts`** - `VoicevoxApi` using native `fetch` with `AbortSignal.timeout(30000)`
- **`queue/`** - Event-driven pipeline: `QueueService` → `AudioGenerator` → `PlaybackService`. Uses `PrefetchManager` for look-ahead generation. Item IDs via `crypto.randomUUID()`.
- **`state/`** - Dual state machines: `ItemStateMachine` (per-item: PENDING→GENERATING→READY→PLAYING→DONE) and `QueueStateMachine` (queue-level: IDLE/PROCESSING/PLAYING/PAUSED)
- **`playback/`** - Strategy pattern: `PlaybackService` lazily initializes strategy via async `createPlaybackStrategy()`. `NodePlaybackStrategy` (ffplay streaming / platform-native file playback) and `BrowserPlaybackStrategy` (HTML5 Audio). No sync `require()` — strategy is resolved on first `play()` call.
- **`queue/file-manager.ts`** - Uses **top-level `await`** to conditionally import `node:fs/promises`, `node:path`, `node:os` (skipped in browser).

### Bun Support

`src/index.ts` detects Bun via `'Bun' in globalThis`. HTTP mode uses `Bun.serve()` directly (Hono is Web Standard compatible), bypassing `@hono/node-server`. Stdio mode works identically.

### Build System

**tsgo** (from `@typescript/native-preview`) is default, **tsc** is fallback. Both produce ESM output to `dist/`. Build script `scripts/fix-permissions.cjs` adds shebang and chmod to `dist/index.js`.

### Testing

Tests use **Vitest**. All API calls are mocked — no VOICEVOX engine needed.

`packages/voicevox-client/vitest.config.ts` aliases `node-playback-strategy` to `src/__mocks__/node-playback-strategy.ts` to avoid loading `child_process.spawn` in tests. When adding new playback strategies, update this mock.

### Key Design Decisions

- **PlaybackService lazy init**: Constructor starts async strategy creation. `isStreamingEnabled()` returns `false` until resolved. By the time `play()` is called, the promise is resolved.
- **Top-level await in file-manager.ts**: Node.js modules are loaded at module evaluation time, not inside an IIFE. This is safe because the package is ESM-only.
- **Config priority**: CLI args (`--speaker 3`) override env vars (`VOICEVOX_DEFAULT_SPEAKER=1`) override hardcoded defaults.
