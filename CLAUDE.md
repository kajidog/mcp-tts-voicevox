# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm**. Do not use npm or yarn.

The root `package.json` is **private and holds no source** — it exists only to
pin `packageManager` (pnpm 10), host the shared devDependencies (Biome,
Changesets), and expose workspace-wide scripts. Run scripts from the root, or
scope them with `pnpm --filter <package> <script>`.

### Build & Validate (whole workspace)
- `pnpm build` - Build every package (tsgo / tsup / vite depending on the package)
- `pnpm lint` - Biome check across **all** packages in one pass
- `pnpm typecheck` - `tsc --noEmit` in each package
- `pnpm test` - Run Vitest across packages

Lint is deliberately a *single root invocation*: `biome.json`'s `includes`
already covers every package, so `pnpm -r lint` would re-check the same files.
Type checking stays per-package because each has its own tsconfig.

### Per-package
- `pnpm --filter @kajidog/mcp-tts-voicevox dev` - Start MCP server in stdio mode via tsx
- `pnpm --filter @kajidog/mcp-tts-voicevox dev:http` - Start MCP server in HTTP mode via tsx
- `pnpm --filter @kajidog/mcp-tts-voicevox dev:bun` - Start MCP server via Bun (TypeScript direct execution)
- `cd apps/mcp-tts && pnpm test` / `pnpm build` / `pnpm typecheck`
- `cd packages/voicevox-client && pnpm test` / `pnpm build` / `pnpm typecheck`

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

**Supported runtimes differ on purpose.** `mcp-tts` requires Node >= 20 (its tsup
`target` matches), while `voicevox-client` stays at >= 18 because it also ships to
browsers and must not gratuitously narrow its consumer range.

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
- **`server.ts`** - MCP tool registration via `server.registerTool()`. Tools are registered unprefixed and exposed with the `voicevox_` prefix (`addToolPrefix` in `tools/registration.ts`; internal `_*` player tools stay unprefixed): `ping`, `speak`, `stop_speaker`, `get_speakers`, `synthesize_file`, plus player and dictionary tools. Uses `registerToolIfEnabled()` for conditional registration. Dynamic schema via `buildSpeakInputSchema()`.
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
  - This is the one package still on **TypeScript 6**. tsup 8.5.1's `dts` step
    (`rollup-plugin-dts`) uses the TypeScript compiler API and dies on
    TypeScript 7 with `Cannot read properties of undefined (reading
    'useCaseSensitiveFileNames')`. Move it to 7 once tsup ships a fix.
- **player-ui**: **vite** + `vite-plugin-singlefile` → one self-contained `dist/mcp-app.html`.

### Testing

Tests use **Vitest** (v4). All API calls are mocked — no VOICEVOX engine needed.

> Two v4 behaviours to keep in mind when writing mocks:
> - A mock used with `new` must be given a **`function` or a class**, never an
>   arrow — `vi.fn(() => ({ … }))` throws `is not a constructor`. Biome's
>   `complexity/useArrowFunction` would rewrite those back into arrows, so the
>   rule is switched off for `**/__tests__/**` in both `biome.json` files.
> - `vi.restoreAllMocks()` only restores `vi.spyOn` spies; it no longer clears
>   `vi.fn()` call history. Use `vi.clearAllMocks()` for that.

`packages/voicevox-client/vitest.config.ts` aliases `node-playback-strategy` to `src/__mocks__/node-playback-strategy.ts` to avoid loading `child_process.spawn` in tests. When adding new playback strategies, update this mock.

`mcp-core`'s tests cover `http.ts`'s security boundary (Origin / Host / API key middleware) by calling `app.request()` on the Hono app directly — no server needs to listen.

`player-ui` has **no tests yet**; it is covered by `typecheck` and Biome only. Its a11y and React-hook-dependency lint rules are scoped to warnings in `biome.json` until there is coverage to refactor against.

### Releases

Versioning and publishing run on **Changesets**. Add a changeset in the same PR as any user-facing change to `@kajidog/mcp-tts-voicevox` or `@kajidog/voicevox-client`:

```
pnpm changeset
```

`.github/workflows/release.yml` then opens a "Version Packages" PR; merging it publishes to npm and pushes git tags. Never bump `version` fields by hand. Private packages (`mcp-core`, `player-ui`) and `examples` are excluded from versioning.

### Key Design Decisions

- **PlaybackService lazy init**: Constructor starts async strategy creation. `isStreamingEnabled()` returns `false` until resolved. By the time `play()` is called, the promise is resolved.
- **Top-level await in file-manager.ts**: Node.js modules are loaded at module evaluation time, not inside an IIFE. This is safe because the package is ESM-only.
- **Config priority**: CLI args (`--speaker 3`) override env vars (`VOICEVOX_DEFAULT_SPEAKER=1`) override config file (`.voicevoxrc.json`) override hardcoded defaults.
- **Declarative config schema**: Config options are defined as `ConfigDefs`/`OptionDef` objects with CLI flag, env var, type, default, and description metadata. The `config-schema.ts` helper in `mcp-core` auto-generates CLI parser, env parser, config file parser, and help text. Adding a new option requires editing only the definition object.
