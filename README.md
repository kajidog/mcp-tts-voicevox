# MCP TTS VOICEVOX

**English** | [日本語](README.ja.md)

A text-to-speech MCP server using VOICEVOX

## Features

- **Advanced playback control** - Flexible audio processing with queue management, immediate playback, and synchronous/asynchronous control
- **Prefetching** - Pre-generates next audio for smooth playback
- **Cross-platform support** - Works on Windows, macOS, and Linux (including WSL environment audio playback)
- **Stdio/HTTP support** - Supports Stdio, SSE, and StreamableHttp
- **Multiple speaker support** - Individual speaker specification per segment
- **Automatic text segmentation** - Stable audio synthesis through automatic long text segmentation
- **Independent client library** - Provided as a separate package [`@kajidog/voicevox-client`](https://www.npmjs.com/package/@kajidog/voicevox-client)

## Requirements

- Node.js 18.0.0 or higher
- [VOICEVOX Engine](https://voicevox.hiroshiba.jp/) or compatible engine

## Installation

```bash
npm install -g @kajidog/mcp-tts-voicevox
```

## Usage

### As MCP Server

#### 1. Start VOICEVOX Engine

Start the VOICEVOX Engine and have it wait on the default port (`http://localhost:50021`).

#### 2. Start MCP Server

**Standard I/O mode (recommended):**

```bash
npx @kajidog/mcp-tts-voicevox
```

**HTTP server mode:**

```bash
# Linux/macOS
MCP_HTTP_MODE=true npx @kajidog/mcp-tts-voicevox

# Windows PowerShell
$env:MCP_HTTP_MODE='true'; npx @kajidog/mcp-tts-voicevox
```

## MCP Tools

### `speak` - Text-to-speech

Converts text to speech and plays it.

**Parameters:**

- `text`: String (multiple texts separated by newlines, speaker specification in "1:text" format)
- `speaker` (optional): Speaker ID
- `speedScale` (optional): Playback speed
- `immediate` (optional): Whether to start playback immediately (default: true)
- `waitForStart` (optional): Whether to wait for playback to start (default: false)
- `waitForEnd` (optional): Whether to wait for playback to end (default: false)

**Examples:**

```javascript
// Simple text
{ "text": "Hello\nIt's a nice day today" }

// Speaker specification
{ "text": "Hello", "speaker": 3 }

// Per-segment speaker specification
{ "text": "1:Hello\n3:It's a nice day today" }

// Immediate playback (bypass queue)
{
  "text": "Emergency message",
  "immediate": true,
  "waitForEnd": true
}

// Wait for playback to complete (synchronous processing)
{
  "text": "Wait for this audio playback to complete before next processing",
  "waitForEnd": true
}

// Add to queue but don't auto-play
{
  "text": "Wait for manual playback start",
  "immediate": false
}
```

### Advanced Playback Control Features

#### Immediate Playback (`immediate: true`)

Play audio immediately by bypassing the queue:

- **Parallel operation with regular queue**: Does not interfere with existing queue playback
- **Multiple simultaneous playback**: Multiple immediate playbacks can run simultaneously
- **Ideal for urgent notifications**: Prioritizes important messages

#### Synchronous Playback Control (`waitForEnd: true`)

Wait for playback completion to synchronize processing:

- **Sequential processing**: Execute next processing after audio playback
- **Timing control**: Enables coordination between audio and other processing
- **UI synchronization**: Align screen display with audio timing

```javascript
// Example 1: Play urgent message immediately and wait for completion
{
  "text": "Emergency! Please check immediately",
  "immediate": true,
  "waitForEnd": true
}

// Example 2: Step-by-step audio guide
{
  "text": "Step 1: Please open the file",
  "waitForEnd": true
}
// Next processing executes after the above audio completes
```

### Other Tools

- `generate_query` - Generate query for speech synthesis
- `synthesize_file` - Generate audio file
- `stop_speaker` - Stop playback and clear queue
- `get_speakers` - Get speaker list
- `get_speaker_detail` - Get speaker details

## Package Structure

### @kajidog/mcp-tts-voicevox (this package)

- **MCP Server** - Communicates with MCP clients like Claude Desktop
- **HTTP Server** - Remote MCP communication via SSE/StreamableHTTP

### [@kajidog/voicevox-client](https://www.npmjs.com/package/@kajidog/voicevox-client) (independent package)

- **General-purpose library** - Communication functionality with VOICEVOX Engine
- **Cross-platform** - Node.js and browser environment support
- **Advanced playback control** - Immediate playback, synchronous playback, and queue management features

## MCP Configuration Examples

### Claude Desktop Configuration

Add the following configuration to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "tts-mcp": {
      "command": "npx",
      "args": ["-y", "@kajidog/mcp-tts-voicevox"]
    }
  }
}
```

#### When SSE Mode is Required

If you need speech synthesis in SSE mode, you can use `mcp-remote` for SSE↔Stdio conversion:

1. **Claude Desktop Configuration**

   ```json
   {
     "mcpServers": {
       "tts-mcp-proxy": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://localhost:3000/sse"]
       }
     }
   }
   ```

2. **Starting SSE Server**

   **Mac/Linux:**

   ```bash
   MCP_HTTP_MODE=true MCP_HTTP_PORT=3000 npx @kajidog/mcp-tts-voicevox
   ```

   **Windows:**

   ```powershell
   $env:MCP_HTTP_MODE='true'; $env:MCP_HTTP_PORT='3000'; npx @kajidog/mcp-tts-voicevox
   ```

````

## Environment Variables

### VOICEVOX Configuration

- `VOICEVOX_URL`: VOICEVOX Engine URL (default: `http://localhost:50021`)
- `VOICEVOX_DEFAULT_SPEAKER`: Default speaker ID (default: `1`)
- `VOICEVOX_DEFAULT_SPEED_SCALE`: Default playback speed (default: `1.0`)

### Playback Options Configuration

- `VOICEVOX_DEFAULT_IMMEDIATE`: Whether to start playback immediately when added to queue (default: `true`)
- `VOICEVOX_DEFAULT_WAIT_FOR_START`: Whether to wait for playback to start (default: `false`)
- `VOICEVOX_DEFAULT_WAIT_FOR_END`: Whether to wait for playback to end (default: `false`)

**Usage Examples:**

```bash
# Example 1: Wait for completion for all audio playback (synchronous processing)
export VOICEVOX_DEFAULT_WAIT_FOR_END=true
npx @kajidog/mcp-tts-voicevox

# Example 2: Wait for both playback start and end
export VOICEVOX_DEFAULT_WAIT_FOR_START=true
export VOICEVOX_DEFAULT_WAIT_FOR_END=true
npx @kajidog/mcp-tts-voicevox

# Example 3: Manual control (disable auto-play)
export VOICEVOX_DEFAULT_IMMEDIATE=false
npx @kajidog/mcp-tts-voicevox
```

These options allow fine-grained control of audio playback behavior according to application requirements.

### Server Configuration

- `MCP_HTTP_MODE`: Enable HTTP server mode (set to `true` to enable)
- `MCP_HTTP_PORT`: HTTP server port number (default: `3000`)
- `MCP_HTTP_HOST`: HTTP server host (default: `0.0.0.0`)

## Usage with WSL (Windows Subsystem for Linux)

Configuration method for connecting from WSL environment to Windows host MCP server.

### 1. Windows Host Configuration

**Starting MCP server with PowerShell:**

```powershell
$env:MCP_HTTP_MODE='true'; $env:MCP_HTTP_PORT='3000'; npx @kajidog/mcp-tts-voicevox
```

### 2. WSL Environment Configuration

**Check Windows host IP address:**

```bash
# Get Windows host IP address from WSL
ip route show | grep default | awk '{print $3}'
```

Usually in the format `172.x.x.1`.

**Claude Code .mcp.json configuration example:**

```json
{
  "mcpServers": {
    "tts": {
      "type": "sse",
      "url": "http://172.29.176.1:3000/sse"
    }
  }
}
```

**Important Points:**
- Within WSL, `localhost` or `127.0.0.1` refers to WSL internal, so cannot access Windows host services
- Use WSL gateway IP (usually `172.x.x.1`) to access Windows host
- Ensure the port is not blocked by Windows firewall

**Connection Test:**

```bash
# Check connection to Windows host MCP server from WSL
curl http://172.29.176.1:3000
```

If normal, `404 Not Found` will be returned (because root path doesn't exist).

## Troubleshooting

### Common Issues

1. **VOICEVOX Engine is not running**

   ```bash
   curl http://localhost:50021/speakers
   ```

2. **Audio is not playing**

   - Check system audio output device
   - Check platform-specific audio playback tools:
     - **Linux**: Requires one of `aplay`, `paplay`, `play`, `ffplay`
     - **macOS**: `afplay` (pre-installed)
     - **Windows**: PowerShell (pre-installed)

3. **Not recognized by MCP client**
   - Check package installation: `npm list -g @kajidog/mcp-tts-voicevox`
   - Check JSON syntax in configuration file

## License

ISC

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/kajidog-mcp-tts-voicevox-badge.png)](https://mseep.ai/app/kajidog-mcp-tts-voicevox)

## Developer Information

Instructions for developing this repository locally.

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/kajidog/mcp-tts-voicevox.git
    cd mcp-tts-voicevox
    ```
2.  Install [pnpm](https://pnpm.io/) (if not already installed).
3.  Install dependencies:
    ```bash
    pnpm install
    ```

### Main Development Commands

You can run the following commands in the project root.

-   **Build all packages:**
    ```bash
    pnpm build
    ```
-   **Run all tests:**
    ```bash
    pnpm test
    ```
-   **Run all linters:**
    ```bash
    pnpm lint
    ```
-   **Start root server in development mode:**
    ```bash
    pnpm dev
    ```
-   **Start stdio interface in development mode:**
    ```bash
    pnpm dev:stdio
    ```

These commands will also properly handle processing for related packages within the workspace.