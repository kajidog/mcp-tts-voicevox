# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm**. Do not use npm or yarn.

This is a pnpm workspace **without a root `package.json`**. Run scripts either
inside a package directory, or across the workspace with `pnpm -r <script>` /
`pnpm --filter <package> <script>`.

### Build & Validate (whole workspace)
- `pnpm -r build` - Build every package (tsgo / tsup / vite depending on the package)
- `pnpm -r lint` - Biome check (+ `tsc --noEmit` in voicevox-client)
- `pnpm -r test` - Run Vitest across packages

### Per-package
- `pnpm --filter @kajidog/mcp-tts-voicevox dev` - Start MCP server in stdio mode via tsx
- `pnpm --filter @kajidog/mcp-tts-voicevox dev:http` - Start MCP server in HTTP mode via tsx
- `pnpm --filter @kajidog/mcp-tts-voicevox dev:bun` - Start MCP server via Bun (TypeScript direct execution)
- `cd apps/mcp-tts && pnpm test` / `pnpm build` / `pnpm lint`
- `cd packages/voicevox-client && pnpm test` / `pnpm build` / `pnpm lint` (lint includes `tsc --noEmit`)

### Run a Single Test
- `cd apps/mcp-tts && pnpm vitest run src/__tests__/config.test.ts`
- `cd packages/voicevox-client && pnpm vitest run src/__tests__/prefetch.test.ts`

## Architecture

VOICEVOX MCP server for text-to-speech. Four workspace packages with strict separation:

### Packages

| Package | Path | Purpose | Build | Runtime Dependencies |
|---------|------|---------|-------|---------------------|
| `@kajidog/mcp-tts-voicevox` | `apps/mcp-tts/` | MCP server (stdio + HTTP modes), npm bin | tsup | MCP SDK, ext-apps, Zod, voicevox-client (+ mcp-core bundled) |
| `@kajidog/voicevox-client` | `packages/voicevox-client/` | Standalone TTS library (npm-publishable) | tsgo | **Zero** (native fetch, crypto.randomUUID) |
| `@kajidog/mcp-core` | `packages/mcp-core/` | Shared MCP server infrastructure (config, HTTP, launcher, stdio) | tsgo | MCP SDK, Hono, @hono/node-server, Zod |
| `@kajidog/player-ui` | `packages/player-ui/` | MCP Apps audio player UI (React, bundled to a single HTML) | vite | React, ext-apps |

`mcp-core` and `player-ui` are `private`. `apps/mcp-tts` bundles `mcp-core` into
its output (`noExternal: ['@kajidog/mcp-core']` in `tsup.config.ts`) and copies
the built `player-ui` HTML to `dist/mcp-app.html`.

### Module System: ESM Only

All packages use `"type": "module"` with `module: NodeNext` in tsconfig. Key conventions:
- All relative imports **must** use `.js` extensions (e.g., `import { getConfig } from './config.js'`)
- No `require()` anywhere — use `await import()` for dynamic imports
- Use `import.meta.url` instead of `__dirname`/`__filename`

### TypeScript Config

There is a root **`tsconfig.base.json`** holding the shared compiler options
(`target: ES2022`, `module/moduleResolution: NodeNext`, `strict`, `types: ["node"]`,
`declaration`, `ignoreDeprecations: "6.0"`, etc.). Each package's `tsconfig.json`
**extends** it and only overrides package-specific bits:
- `apps/mcp-tts`, `packages/mcp-core` — just `outDir`/`rootDir`/`include`/`exclude`
- `packages/voicevox-client` — adds `lib: ["ES2022", "DOM"]` and a `typeRoots` entry for `./src/types`
- `packages/player-ui` — overrides to browser/React settings (`moduleResolution: bundler`, `jsx`, `noEmit`, `types: []`)

To change a compiler option for everyone, edit `tsconfig.base.json`.

### MCP Server (`apps/mcp-tts/src/`)

- **`index.ts`** - Entry point with runtime detection (Node.js/Bun via `mcp-core`'s `isBun`/`isNodejs`), CLI arg parsing, auto-starts stdio or HTTP server. Reads `package.json` via `readFileSync` (no `require` for JSON).
- **`config.ts`** - VOICEVOX-specific config built on `mcp-core`'s schema helpers. Priority: CLI args > env vars > config file (`.voicevoxrc.json`) > defaults. Add new options to the declarative config defs — CLI/env/config-file parsing and help text are auto-generated.
- **`server.ts`** - MCP tool registration via `server.registerTool()`. Tools: `ping_voicevox`, `speak`, `generate_query`, `synthesize_file`, `stop_speaker`, `get_speakers`, plus player/dictionary tools. Uses `registerToolIfEnabled()` for conditional registration. Dynamic schema via `buildSpeakInputSchema()`.
- **`tool-groups.ts`** - Tool grouping for `--disable-groups` / conditional registration.
- **`stdio.ts`** - Minimal stdio transport wrapper.
- **`tools/`** - Tool implementations (`speak`, `synthesize`, `speakers`, `dictionary`, `player`, `player-ui`). Per-session player state lives in `tools/player/session-state.ts`.

### Shared MCP Infrastructure (`packages/mcp-core/src/`)

- **`config.ts`** - Base server config (`baseConfigDefs`, CLI/env parsers).
- **`config-schema.ts`** - Declarative schema engine: generates CLI parser, env parser, config-file parser, help text, and templates from `ConfigDefs`/`OptionDef` objects.
- **`http.ts`** - `createHttpApp`: Hono app with CORS, Origin/Host validation (MCP spec), session management via Web Standard streamable HTTP transport.
- **`launcher.ts`** - `launchServer`/`startHttpServer`/`startStdioServer`; Bun detection (`isBun`), HTTP via `Bun.serve()` when on Bun (Hono is Web Standard compatible), otherwise `@hono/node-server`.
- **`stdio.ts`** - `connectStdio`.

### VoicevoxClient Library (`packages/voicevox-client/src/`)

- **`client.ts`** - `VoicevoxClient` facade: `speak()`, `generateQuery()`, `generateAudioFile()`, queue management
- **`api.ts`** - `VoicevoxApi` using native `fetch` with `AbortSignal.timeout(30000)`
- **`queue/`** - Event-driven pipeline: `QueueService` → `AudioGenerator` → `PlaybackService`. Uses `PrefetchManager` for look-ahead generation. Item IDs via `crypto.randomUUID()`.
- **`state/`** - Dual state machines: `ItemStateMachine` (per-item: PENDING→GENERATING→READY→PLAYING→DONE) and `QueueStateMachine` (queue-level: IDLE/PROCESSING/PLAYING/PAUSED)
- **`playback/`** - Strategy pattern: `PlaybackService` lazily initializes strategy via async `createPlaybackStrategy()`. `NodePlaybackStrategy` (ffplay streaming / platform-native file playback) and `BrowserPlaybackStrategy` (HTML5 Audio). No sync `require()` — strategy is resolved on first `play()` call.
- **`queue/file-manager.ts`** - Uses **top-level `await`** to conditionally import `node:fs/promises`, `node:path`, `node:os` (skipped in browser).

### Build System

- **mcp-core / voicevox-client**: **tsgo** (from `@typescript/native-preview`) is default, **tsc** is fallback (`build:tsc`). ESM output to `dist/`.
- **mcp-tts**: **tsup** (esbuild bundler + tsc-based `dts`). Bundles `mcp-core`, externalizes `voicevox-client`/`@modelcontextprotocol/*`/`zod`, and copies `player-ui`'s HTML.
- **player-ui**: **vite** + `vite-plugin-singlefile` → one self-contained `dist/mcp-app.html`.

### Testing

Tests use **Vitest** (pinned to v2). All API calls are mocked — no VOICEVOX engine needed.

`packages/voicevox-client/vitest.config.ts` aliases `node-playback-strategy` to `src/__mocks__/node-playback-strategy.ts` to avoid loading `child_process.spawn` in tests. When adding new playback strategies, update this mock.

### Key Design Decisions

- **PlaybackService lazy init**: Constructor starts async strategy creation. `isStreamingEnabled()` returns `false` until resolved. By the time `play()` is called, the promise is resolved.
- **Top-level await in file-manager.ts**: Node.js modules are loaded at module evaluation time, not inside an IIFE. This is safe because the package is ESM-only.
- **Config priority**: CLI args (`--speaker 3`) override env vars (`VOICEVOX_DEFAULT_SPEAKER=1`) override config file (`.voicevoxrc.json`) override hardcoded defaults.
- **Declarative config schema**: Config options are defined as `ConfigDefs`/`OptionDef` objects with CLI flag, env var, type, default, and description metadata. The `config-schema.ts` helper in `mcp-core` auto-generates CLI parser, env parser, config file parser, and help text. Adding a new option requires editing only the definition object.
