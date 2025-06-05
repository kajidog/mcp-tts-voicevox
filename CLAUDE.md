# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server in stdio mode
- `npm run dev:http` - Start development server in HTTP mode  
- `npm run dev:stdio` - Start development server in stdio mode explicitly

### Building and Testing
- `npm run build` - Build TypeScript to dist/ and fix permissions
- `npm run build:clean` - Clean build (remove dist/ and rebuild)
- `npm run lint` - Run TypeScript type checking (use this for validation)
- `npm test` - Run Jest test suite for both main package and voicevox-client
- `npm run test:sound` - Test sound playback functionality

### Production
- `npm start` - Run built server in stdio mode
- `npm run start:http` - Run built server in HTTP mode
- `npm run start:stdio` - Run built server in stdio mode explicitly

### Working with packages/voicevox-client
- `cd packages/voicevox-client && npm run build` - Build the voicevox-client package
- `cd packages/voicevox-client && npm test` - Run tests for voicevox-client
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
   - **Zod Validation**: Schema-based parameter validation
   - **External Dependency**: Uses `@kajidog/voicevox-client` for functionality

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
   - `src/player.ts`: Audio playback coordination
   - `src/error.ts`: Error handling and types

### Development Workflow

**For MCP Server Development** (src/):
- Work only with MCP protocol and server functionality
- Use `@kajidog/voicevox-client` as external dependency
- Focus on Claude Desktop integration and HTTP API

**For VoicevoxClient Development** (packages/voicevox-client/):
- Complete VOICEVOX functionality implementation
- Independent testing and building
- Can be published separately to npm

### Environment Variables

- `VOICEVOX_URL`: VOICEVOX engine URL (default: http://localhost:50021)
- `VOICEVOX_DEFAULT_SPEAKER`: Default speaker ID (default: 1)
- `VOICEVOX_DEFAULT_SPEED_SCALE`: Default playback speed (default: 1.0)
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
- `sound-play`: Audio playback (Node.js only)

### Testing

- **Main Package**: MCP server functionality tests
- **VoicevoxClient Package**: Comprehensive queue management and audio processing tests
- **Both packages tested**: Jest runs tests for both src/ and packages/voicevox-client/

### Important Separation

The architecture enforces clear separation:
- **src/**: MCP server only, no library functions
- **packages/voicevox-client/**: Complete VOICEVOX library
- **Users choose**: MCP server for Claude Desktop, or library for custom applications