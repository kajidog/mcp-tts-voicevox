# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server in stdio mode
- `npm run dev:http` - Start development server in HTTP mode  
- `npm run dev:stdio` - Start development server in stdio mode explicitly
- `npm run dev:http:win` - Windows-specific HTTP mode with PowerShell environment setup

### Building and Testing
- `npm run build` - Build TypeScript to dist/ using tsgo (TypeScript native compilation) and fix permissions
- `npm run build:tsc` - Build TypeScript to dist/ using traditional tsc compiler (fallback option)
- `npm run build:clean` - Clean build (remove dist/ and rebuild)
- `npm run lint` - Run Biome linting and TypeScript type checking (use this for validation)
- `npm run lint:fix` - Run Biome linting with auto-fix and format code
- `npm test` - Run Vitest test suite for both main package and voicevox-client
- `npm run test:sound` - Test sound playback functionality

### Production
- `npm start` - Run built server in stdio mode
- `npm run start:http` - Run built server in HTTP mode
- `npm run start:stdio` - Run built server in stdio mode explicitly
- `npm run start:http:win` - Windows-specific HTTP mode startup

### Working with packages/voicevox-client
- `cd packages/voicevox-client && npm run build` - Build the voicevox-client package using tsgo
- `cd packages/voicevox-client && npm run build:tsc` - Build the voicevox-client package using traditional tsc
- `cd packages/voicevox-client && npm test` - Run Vitest tests for voicevox-client
- `cd packages/voicevox-client && npm run lint` - Run Biome linting and TypeScript checking for voicevox-client
- `cd packages/voicevox-client && npm run lint:fix` - Run Biome linting with auto-fix for voicevox-client
- `cd packages/voicevox-client && npm pack` - Package for publishing

## Architecture

This is a VOICEVOX MCP (Model Context Protocol) server that provides text-to-speech capabilities. The project is structured as two separate packages with distinct responsibilities:

### Package Architecture

1. **@kajidog/mcp-tts-voicevox** (src/ directory):
   - **MCP Server Only**: Pure MCP protocol implementation
   - **Node.js Environment**: Stdio and HTTP server modes
   - **Claude Desktop Integration**: Primary use case
   - **No Library Functions**: Removed client re-exports

2. **@kajidog/voicevox-client** (packages/voicevox-client/):
   - **Standalone Library**: Independent VOICEVOX client
   - **Complete Implementation**: Full audio synthesis and queue management
   - **Cross-platform**: Node.js environments (browser support removed)
   - **Published Package**: Available on npm as `@kajidog/voicevox-client`

### Core MCP Server Components (src/)

1. **Entry Point** (`src/index.ts`):
   - **Multi-mode Architecture**: Stdio (default) and HTTP modes
   - **Environment Detection**: CLI vs library usage detection
   - **Server Management**: Automatic mode selection based on environment
   - **No Library Exports**: Pure MCP server functionality

2. **MCP Server Implementation** (`src/server.ts`):
   - **MCP Tools**: `speak`, `generate_query`, `synthesize_file`, `stop_speaker`, `get_speakers`, `get_speaker_detail`
   - **Text Input Processing**: String-only format with line breaks and speaker prefix support ("1:Hello\n2:World")
   - **Zod Validation**: Schema-based parameter validation
   - **External Dependency**: Uses `@kajidog/voicevox-client` for functionality

3. **Server Modes**:
   - **Stdio Mode** (`src/stdio.ts`): Standard MCP protocol for Claude Desktop
   - **HTTP/SSE Mode** (`src/sse.ts`): REST API and real-time communication

### Build System

The project uses **TypeScript native compilation (tsgo)** as the default build method with traditional TypeScript compiler (tsc) as a fallback option.

**Build Approach:**
- **Default**: `tsgo` from `@typescript/native-preview` package provides faster compilation and better performance
- **Fallback**: `tsc` from standard TypeScript compiler for compatibility and debugging
- **Both packages** use the same build system with consistent commands

**Key Benefits of tsgo:**
- **Performance**: Faster compilation times compared to traditional tsc
- **Native Code**: Compiles TypeScript to optimized native code
- **Compatibility**: Maintains full TypeScript compatibility and type checking
- **Development**: Experimental TypeScript compiler from Microsoft

**Build Commands:**
- `npm run build` - Uses tsgo (default)
- `npm run build:tsc` - Uses traditional tsc (fallback)
- Both commands maintain the same output structure and file organization

### VoicevoxClient Package (packages/voicevox-client/)

1. **Client Architecture**:
   - **VoicevoxClient**: Main client class (facade pattern) for VOICEVOX interaction
   - **Options-based API**: Unified `speak(input, options)` signature
   - **Queue System**: Event-driven audio processing pipeline with state machine
   - **Streaming Playback**: Direct buffer playback via ffplay (no temp files)
   - **API Layer**: HTTP communication with VOICEVOX engine

2. **Directory Structure**:
   ```
   packages/voicevox-client/src/
   ├── client.ts              # VoicevoxClient (main facade)
   ├── api.ts                 # VoicevoxApi (VOICEVOX Engine communication)
   ├── types.ts               # Type definitions
   ├── error.ts               # Error handling
   ├── utils.ts               # Utilities
   │
   ├── state/                 # State management
   │   ├── item-state-machine.ts   # Item state transitions (PENDING→GENERATING→READY→PLAYING→DONE)
   │   └── types.ts
   │
   ├── playback/              # Playback functionality
   │   ├── playback-service.ts     # Unified playback service with AbortController
   │   ├── playback-strategy.ts    # Platform-specific strategies (Strategy pattern)
   │   └── types.ts
   │
   └── queue/                 # Queue management
       ├── queue-service.ts        # Queue operations
       ├── audio-generator.ts      # Audio generation
       ├── file-manager.ts         # File management
       ├── event-manager.ts        # Event management
       └── types.ts
   ```

3. **Audio Playback Architecture**:
   - **Strategy Pattern**: `PlaybackStrategy` interface with platform-specific implementations
   - **Streaming Mode**: When `ffplay` is available, plays audio directly from memory buffer
   - **File Mode Fallback**: Uses platform-native tools when streaming is unavailable
     - **macOS**: `afplay` command
     - **Windows**: PowerShell `MediaPlayer` with proper timing and hidden windows
     - **Linux**: Auto-detection of available players (`aplay`, `paplay`, `play`, `ffplay`)
   - **Browser**: Native HTML5 Audio API with blob URLs
   - **AbortController**: Graceful playback cancellation
   - **No external dependencies**: Uses platform-native tools only

### Development Workflow

**For MCP Server Development** (src/):
- Work only with MCP protocol and server functionality
- Use `@kajidog/voicevox-client` as external dependency
- Focus on Claude Desktop integration and HTTP API

**For VoicevoxClient Development** (packages/voicevox-client/):
- Complete VOICEVOX functionality implementation
- Independent testing and building
- Can be published separately to npm
- Always run `npm run lint` and `npm test` before committing changes
- Audio playback changes require testing the mock implementations

### Development Environment Setup

**Required for full functionality**:
1. **VOICEVOX Engine**: Download and run from https://voicevox.hiroshiba.jp/
2. **Node.js 18+**: Required for both packages
3. **Platform-specific audio tools**:
   - **macOS**: `afplay` (built-in)
   - **Windows**: PowerShell (built-in)
   - **Linux**: `aplay`, `paplay`, `play`, or `ffplay`

**Testing without VOICEVOX Engine**:
- Tests use mocked API responses and don't require actual VOICEVOX engine
- `npm test` runs completely offline with mocked dependencies

### Environment Variables

**Core Settings:**
- `VOICEVOX_URL`: VOICEVOX engine URL (default: http://localhost:50021)
- `VOICEVOX_DEFAULT_SPEAKER`: Default speaker ID (default: 1)
- `VOICEVOX_DEFAULT_SPEED_SCALE`: Default playback speed (default: 1.0)

**Playback Options:**
- `VOICEVOX_DEFAULT_IMMEDIATE`: Start playback immediately when queued (default: true)
- `VOICEVOX_DEFAULT_WAIT_FOR_START`: Wait for playback to start (default: false)
- `VOICEVOX_DEFAULT_WAIT_FOR_END`: Wait for playback to end (default: false)
- `VOICEVOX_STREAMING_PLAYBACK`: Enable streaming playback via ffplay (default: true when ffplay is available)

**Server Configuration:**
- `MCP_HTTP_MODE`: Enable HTTP server mode (set to "true")
- `MCP_HTTP_PORT`: HTTP server port (default: 3000)
- `MCP_HTTP_HOST`: HTTP server host (default: 0.0.0.0)
- `NODE_ENV`: Set to "development" for dev mode

### Dependencies

**Main Package**:
- `@kajidog/voicevox-client`: VOICEVOX functionality
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `hono`: HTTP server framework
- `zod`: Schema validation

**VoicevoxClient Package**:
- `axios`: HTTP client for VOICEVOX API
- `uuid`: Unique ID generation
- Built-in command-line audio playback (cross-platform, no external dependencies)

**Development Dependencies (Both Packages)**:
- `@typescript/native-preview`: TypeScript native compilation (tsgo) - **default build method**
- `typescript`: Traditional TypeScript compiler (tsc) - **fallback option**
- `@biomejs/biome`: Fast linter and formatter for JavaScript/TypeScript
- `vitest`: Fast unit testing framework with native TypeScript support

### Testing

- **Main Package**: MCP server functionality tests
- **VoicevoxClient Package**: Comprehensive queue management and audio processing tests
- **Cross-platform Mocking**: Audio playback tests use mocked `child_process.spawn`, `fs`, and `os` modules
- **Test Isolation**: Each test suite runs independently with proper cleanup
- **Both packages tested**: Vitest runs tests for both src/ and packages/voicevox-client/
- **Test Framework**: Uses Vitest for faster testing with native TypeScript support

### Audio Playback Development Notes

**When modifying audio playback (`packages/voicevox-client/src/playback/`)**:
- **Strategy Pattern**: Add new strategies by implementing `PlaybackStrategy` interface
- **Testing**: Mock `child_process.spawn` in tests with proper event simulation (including `kill`, `stdin`)
- **Platform Testing**: Test across macOS (`afplay`), Windows (PowerShell), Linux (multiple players)
- **Streaming**: `ffplay` must be available for streaming playback; test both streaming and file modes
- **Windows**: Use `windowsHide: true` for PowerShell to prevent window flashing
- **Cancellation**: Use `AbortController` signal for graceful playback stop
- **Browser**: Maintain `BrowserPlaybackStrategy` compatibility with HTML5 Audio API

### Important Separation

The architecture enforces clear separation:
- **src/**: MCP server only, no library functions
- **packages/voicevox-client/**: Complete VOICEVOX library
- **Users choose**: MCP server for Claude Desktop, or library for custom applications