# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server in stdio mode
- `npm run dev:http` - Start development server in HTTP mode  
- `npm run dev:stdio` - Start development server in stdio mode explicitly
- `npm run dev:http:win` - Windows-specific HTTP mode with PowerShell environment setup

### Building and Testing
- `npm run build` - Build TypeScript to dist/ and fix permissions
- `npm run build:clean` - Clean build (remove dist/ and rebuild)
- `npm run lint` - Run TypeScript type checking (use this for validation)
- `npm test` - Run Jest test suite for all packages
- `npm run test:sound` - Test sound playback functionality
- Run a single test file: `npm test -- path/to/test.test.ts`
- Run tests in watch mode: `npm test -- --watch`
- Run tests with coverage: `npm test -- --coverage`

### Production
- `npm start` - Run built server in stdio mode
- `npm run start:http` - Run built server in HTTP mode
- `npm run start:stdio` - Run built server in stdio mode explicitly
- `npm run start:http:win` - Windows-specific HTTP mode startup

### Working with packages/voicevox-client
- `cd packages/voicevox-client && npm run build` - Build the voicevox-client package
- `cd packages/voicevox-client && npm test` - Run tests for voicevox-client
- `cd packages/voicevox-client && npm run lint` - Run TypeScript checking for voicevox-client
- `cd packages/voicevox-client && npm pack` - Package for publishing
- `cd packages/voicevox-client && npm run prepublishOnly` - Run lint before publishing

### Working with packages/voice-engine-manager
- `cd packages/voice-engine-manager && npm run build` - Build the voice-engine-manager package
- `cd packages/voice-engine-manager && npm test` - Run tests for voice-engine-manager
- `cd packages/voice-engine-manager && npm run lint` - Run TypeScript checking for voice-engine-manager
- `cd packages/voice-engine-manager && npm run build:clean` - Clean build the package
- `cd packages/voice-engine-manager && npm run prepublishOnly` - Run lint before publishing

## Architecture

This is a multi-engine TTS MCP (Model Context Protocol) server that provides text-to-speech capabilities supporting VOICEVOX and AivisSpeech engines. The project is structured as three separate packages with distinct responsibilities:

### Package Architecture

1. **@kajidog/mcp-tts-voicevox** (src/ directory):
   - **Multi-Engine MCP Server**: Pure MCP protocol implementation with multiple TTS engine support
   - **Node.js Environment**: Stdio and HTTP server modes
   - **Claude Desktop Integration**: Primary use case
   - **Engine Management**: Uses `@kajidog/voice-engine-manager` for multi-engine orchestration

2. **@kajidog/voicevox-client** (packages/voicevox-client/):
   - **Standalone Library**: Independent VOICEVOX client
   - **Complete Implementation**: Full audio synthesis and queue management
   - **Cross-platform**: Node.js environments (browser support removed)
   - **Published Package**: Available on npm as `@kajidog/voicevox-client`

3. **@kajidog/voice-engine-manager** (packages/voice-engine-manager/):
   - **Engine Orchestration**: Unified interface for multiple TTS engines (VOICEVOX, AivisSpeech)
   - **Process Management**: Automatic engine startup and health monitoring
   - **Priority-based Selection**: Smart engine selection with priority and health awareness
   - **Configuration Management**: Runtime configuration updates and filtering

### Core MCP Server Components (src/)

1. **Entry Point** (`src/index.ts`):
   - **Multi-mode Architecture**: Stdio (default) and HTTP modes
   - **Environment Detection**: CLI vs library usage detection
   - **Server Management**: Automatic mode selection based on environment
   - **No Library Exports**: Pure MCP server functionality

2. **MCP Server Implementation** (`src/server.ts`):
   - **Multi-Engine MCP Tools**: `speak`, `generate_query`, `synthesize_file`, `stop_speaker`, `get_speakers`, `start_engine`, `get_engine_status`
   - **Speaker Format**: New `name-{id}` format (e.g., `main-1`, `aivis-2`) with backward compatibility for numeric IDs
   - **Text Input Processing**: String-only format with line breaks and speaker prefix support ("main-1:Hello\n2:World")
   - **Engine Management**: Uses VoiceEngineManager with DDD architecture
   - **Client Caching**: Per-engine VoicevoxClient instances are cached for performance
   - **Enhanced Error Handling**: Context-aware error messages with tool names

3. **Server Modes**:
   - **Stdio Mode** (`src/stdio.ts`): Standard MCP protocol for Claude Desktop
   - **HTTP/SSE Mode** (`src/sse.ts`): REST API and real-time communication

### VoicevoxClient Package (packages/voicevox-client/)

1. **Client Architecture**:
   - **VoicevoxClient**: Main client class for VOICEVOX interaction
   - **Queue System**: Advanced audio processing pipeline
   - **Audio Management**: File generation and playback handling
   - **API Layer**: HTTP communication with VOICEVOX engine

2. **Key Components**:
   - `src/client.ts`: Main VoicevoxClient implementation
   - `src/api.ts`: VOICEVOX engine API communication
   - `src/queue/`: Audio queue management system
   - `src/queue/audio-player.ts`: Cross-platform audio playback (command-line based)
   - `src/player.ts`: Audio playback coordination
   - `src/error.ts`: Error handling and types

### VoiceEngineManager Package (packages/voice-engine-manager/)

1. **DDD Architecture**:
   - **IEngine Interface**: Contract for all TTS engines
   - **BaseEngine Abstract Class**: Common functionality for engines
   - **VoiceEngineManager**: DI-based engine orchestration
   - **ProcessManager**: Shared process management logic
   - **ExecutableFinder**: Cross-platform executable discovery

2. **Key Components**:
   - `src/manager.ts`: VoiceEngineManager with dependency injection
   - `src/engine-factory.ts`: Factory pattern for backward compatibility
   - `src/types.ts`: Core domain types and interfaces
   - `src/engines/`: Concrete engine implementations
   - `src/process-manager.ts`: Process lifecycle management
   - `src/utils/executable-finder.ts`: Auto-discovery of TTS applications

3. **Engine Auto-Discovery**:
   - **boot_command: "auto"**: Automatically finds and launches TTS applications
   - **Platform-specific paths**: Searches default installation directories
   - **Fallback to PATH**: Uses system PATH if not found in default locations
   - **Supported platforms**: Windows, macOS, Linux with specific paths for each

### Development Workflow

**For MCP Server Development** (src/):
- Work only with MCP protocol and server functionality
- Use `@kajidog/voicevox-client` and `@kajidog/voice-engine-manager` as external dependencies
- Focus on Claude Desktop integration and HTTP API
- New speaker format: `name-{id}` (e.g., `main-1`) with backward compatibility for numeric IDs

**For VoicevoxClient Development** (packages/voicevox-client/):
- Complete VOICEVOX functionality implementation
- Independent testing and building
- Can be published separately to npm
- Always run `npm run lint` and `npm test` before committing changes
- Audio playback changes require testing the mock implementations

**For VoiceEngineManager Development** (packages/voice-engine-manager/):
- Multi-engine orchestration and process management
- Health monitoring and configuration management
- Extensible architecture for adding new TTS engines
- Independent testing with mocked child processes and HTTP requests

### Development Environment Setup

**Required for full functionality**:
1. **TTS Engines**: Download and run engines
   - **VOICEVOX**: https://voicevox.hiroshiba.jp/ (default: http://localhost:50021)
   - **AivisSpeech**: https://aivis-project.com/ (default: http://localhost:10101)
2. **Node.js 18+**: Required for all packages
3. **Platform-specific audio tools**:
   - **macOS**: `afplay` (built-in)
   - **Windows**: PowerShell (built-in)
   - **Linux**: `aplay`, `paplay`, `play`, or `ffplay`

**Testing without TTS Engines**:
- Tests use mocked API responses and don't require actual engines
- `npm test` runs completely offline with mocked dependencies
- Multi-engine tests use mocked child processes and HTTP requests

### Environment Variables

**Multi-Engine Configuration (New):**

**Dot-notation Environment Variables (Recommended):**
```bash
# VOICEVOX engine
VOICEVOX_ENGINES.main.type=voicevox
VOICEVOX_ENGINES.main.url=http://localhost:50021
VOICEVOX_ENGINES.main.priority=1

# AivisSpeech engine  
VOICEVOX_ENGINES.aivis.type=aivisspeech
VOICEVOX_ENGINES.aivis.url=http://localhost:10101
VOICEVOX_ENGINES.aivis.priority=2
```

**Legacy JSON Array (Backward Compatibility):**
```bash
VOICEVOX_ENGINES='[{"name":"main","type":"voicevox","url":"http://localhost:50021","priority":1},{"name":"aivis","type":"aivisspeech","url":"http://localhost:10101","priority":2}]'
```

**Legacy Single-Engine Settings (Backward Compatibility):**
- `VOICEVOX_URL`: VOICEVOX engine URL (default: http://localhost:50021)
- `VOICEVOX_DEFAULT_SPEAKER`: Default speaker ID (default: 1)
- `VOICEVOX_DEFAULT_SPEED_SCALE`: Default playback speed (default: 1.0)

**Playback Options (new):**
- `VOICEVOX_DEFAULT_IMMEDIATE`: Start playback immediately when queued (default: true)
- `VOICEVOX_DEFAULT_WAIT_FOR_START`: Wait for playback to start (default: false)
- `VOICEVOX_DEFAULT_WAIT_FOR_END`: Wait for playback to end (default: false)

**Server Configuration:**
- `MCP_HTTP_MODE`: Enable HTTP server mode (set to "true")
- `MCP_HTTP_PORT`: HTTP server port (default: 3000)
- `MCP_HTTP_HOST`: HTTP server host (default: 0.0.0.0)
- `NODE_ENV`: Set to "development" for dev mode

**Logger Configuration:**
- `LOG_LEVEL`: Set logging level (DEBUG, INFO, WARN, ERROR, SILENT) (default: INFO)
- `LOG_COLOR`: Enable/disable colored output (default: "true" when TTY detected)
- `LOG_TIMESTAMP`: Enable/disable timestamps in logs (default: "true")
- `LOG_FORMAT`: Set log format to "json" for structured JSON logs (default: plain text)

### Dependencies

**Main Package**:
- `@kajidog/voicevox-client`: VOICEVOX functionality
- `@kajidog/voice-engine-manager`: Multi-engine orchestration
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `hono`: HTTP server framework
- `zod`: Schema validation

**VoicevoxClient Package**:
- `axios`: HTTP client for VOICEVOX API
- `uuid`: Unique ID generation
- Built-in command-line audio playback (cross-platform, no external dependencies)

**VoiceEngineManager Package**:
- `axios`: HTTP client for engine health checks
- Built-in child process management (no external dependencies)

### Testing

- **Main Package**: MCP server functionality tests with multi-engine support
- **VoicevoxClient Package**: Comprehensive queue management and audio processing tests
- **VoiceEngineManager Package**: Multi-engine orchestration, health monitoring, and process management tests
- **Cross-platform Mocking**: Audio playback tests use mocked `child_process.spawn`, `fs`, and `os` modules
- **Test Isolation**: Each test suite runs independently with proper cleanup
- **All packages tested**: Jest runs tests for src/, packages/voicevox-client/, and packages/voice-engine-manager/

### Audio Playback Development Notes

**When modifying audio playback (`packages/voicevox-client/src/queue/audio-player.ts`)**:
- Test across platforms: macOS (`afplay`), Windows (PowerShell), Linux (multiple players)
- Mock `child_process.spawn` in tests with proper event simulation
- Handle file path escaping for special characters (especially Windows)
- Use `windowsHide: true` for Windows PowerShell to prevent window flashing
- Maintain browser compatibility with HTML5 Audio API

### Important Separation

The architecture enforces clear separation:
- **src/**: Multi-engine MCP server only, orchestrates multiple TTS engines
- **packages/voicevox-client/**: Complete VOICEVOX library
- **packages/voice-engine-manager/**: Engine orchestration and process management
- **Users choose**: MCP server for Claude Desktop, or individual libraries for custom applications

### Multi-Engine Speaker Format

**New Format**: `name-{id}` (e.g., `main-1`, `aivis-2`, `voicevox-3`)
- Engine name followed by dash and speaker ID
- Used in all MCP tools: speak, generate_query, synthesize_file, get_speakers

**Backward Compatibility**: Numeric IDs (e.g., `1`, `2`, `3`)
- Automatically mapped to default engine (highest priority)
- Legacy format continues to work seamlessly

**Environment Variable Priority**:
1. Dot-notation variables (`VOICEVOX_ENGINES.name.param`) - Multi-engine configuration (recommended)
2. `VOICEVOX_ENGINES` (JSON array) - Multi-engine configuration (legacy)
3. `VOICEVOX_URL` - Single engine (backward compatibility)
4. Default: Single VOICEVOX engine at http://localhost:50021

**Dot-notation Parameters**:
- `type`: Engine type (`voicevox` or `aivisspeech`) - **Required**
- `url`: Engine URL (defaults based on type if omitted)
- `priority`: Priority (lower number = higher priority, default: 1)
- `default_speaker`: Default speaker ID
- `boot_command`: Boot command (`auto` for auto-discovery, custom command, or `deny`, default: `deny`)
- `speed_scale`, `pitch_scale`, `intonation_scale`, `volume_scale`: Audio processing parameters

### Common Issues and Solutions

1. **Failed Tests in ExecutableFinder**: The tests mock file system access. Actual functionality works correctly.
2. **Engine Not Starting with auto**: Ensure the TTS application is installed in default location or available in PATH.
3. **Multiple Engine Priority**: Lower numbers have higher priority (1 > 2 > 3).
4. **WSL Audio Issues**: Ensure Windows host is running the MCP server, not WSL directly.

### Recent Architecture Changes

**DDD Refactoring (latest)**:
- Migrated from monolithic Manager class to DDD with dependency injection
- Added IEngine interface and BaseEngine abstract class for extensibility
- Implemented VoiceEngineManager with DI support
- Created EngineFactory for backward compatibility
- Added ExecutableFinder for cross-platform auto-discovery

**Key Benefits**:
- Easy addition of new TTS engines by implementing IEngine
- Testable architecture with proper separation of concerns
- Backward compatible with existing Manager API

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.