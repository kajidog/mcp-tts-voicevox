# VOICEVOX TTS MCP

**English** | [日本語](README.ja.md)

A text-to-speech MCP server using VOICEVOX

> 🎮 **[Try the Browser Demo](https://kajidog.github.io/mcp-tts-voicevox/)** — Test VoicevoxClient directly in your browser

## What You Can Do

- **Make your AI assistant speak** — Text-to-speech from MCP clients like Claude Desktop
- **Multi-character conversations** — Switch speakers per segment in a single call
- **Smooth playback** — Queue management, immediate playback, prefetching, streaming
- **Cross-platform** — Works on Windows, macOS, Linux (including WSL)

## Quick Start

### Requirements

- Node.js 18.0.0 or higher (or [Bun](https://bun.sh/))
- [VOICEVOX Engine](https://voicevox.hiroshiba.jp/) (must be running)
- ffplay (optional, recommended)

#### Installing FFplay

ffplay is a lightweight player included with FFmpeg that supports playback from stdin. When available, it automatically enables low-latency streaming playback.

> 💡 **FFplay is optional.** Without it, playback falls back to temp file-based playback (Windows: PowerShell, macOS: afplay, Linux: aplay, etc.).

- Easy setup: One-liner installation for each OS (see steps below)
- Required: `ffplay` must be in PATH (restart terminal/apps after installation)

<details>
<summary>FFplay Installation and PATH Setup</summary>

Installation examples:

- Windows (any of these)
  - Winget: `winget install --id=Gyan.FFmpeg -e`
  - Chocolatey: `choco install ffmpeg`
  - Scoop: `scoop install ffmpeg`
  - Official builds: Download from https://www.gyan.dev/ffmpeg/builds/ or https://github.com/BtbN/FFmpeg-Builds and add the `bin` folder to PATH

- macOS
  - Homebrew: `brew install ffmpeg`

- Linux
  - Debian/Ubuntu: `sudo apt-get update && sudo apt-get install -y ffmpeg`
  - Fedora: `sudo dnf install -y ffmpeg`
  - Arch: `sudo pacman -S ffmpeg`

PATH Setup:

- Windows: Add `...\ffmpeg\bin` to environment variables, then restart PowerShell/terminal and editor (Claude/VS Code, etc.)
  - Verify: `powershell -c "$env:Path"` should include the ffmpeg path
- macOS/Linux: Usually auto-detected. Check with `echo $PATH` if needed, restart shell.
- MCP clients (Claude Desktop/Code): Restart the app to reload PATH.

Verification:

```bash
ffplay -version
```

If version info is displayed, installation is complete. CLI/MCP will automatically detect ffplay and use stdin streaming playback.

</details>


### 3 Steps to Get Started

**1. Start VOICEVOX Engine**

**2. Add to Claude Desktop config file**

Config file location:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

> 💡 Bun を使う場合は `npx` を `bunx` に置き換えるだけでOK:
> ```json
> "command": "bunx", "args": ["@kajidog/mcp-tts-voicevox"]
> ```

**3. Restart Claude Desktop**

That's it! Ask Claude to "say hello" and it will speak!

---

## MCP Tools

### `speak` — Text-to-Speech

The main feature callable from Claude.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `text` | Text to speak (multiple segments separated by newlines) | Required |
| `speaker` | Speaker ID | 1 |
| `speedScale` | Playback speed | 1.0 |
| `immediate` | Immediate playback (clears queue) | true |
| `waitForEnd` | Wait for playback completion | false |

**Examples:**

```javascript
// Simple text
{ "text": "Hello" }

// Specify speaker
{ "text": "Hello", "speaker": 3 }

// Different speakers per segment
{ "text": "1:Hello\n3:Nice weather today" }

// Wait for completion (synchronous processing)
{ "text": "Wait for this to finish before continuing", "waitForEnd": true }
```

<details>
<summary>Other Tools</summary>

| Tool | Description |
|------|-------------|
| `ping_voicevox` | Check VOICEVOX Engine connection |
| `get_speakers` | Get list of available speakers |
| `get_speaker_detail` | Get speaker details |
| `stop_speaker` | Stop playback and clear queue |
| `generate_query` | Generate speech synthesis query |
| `synthesize_file` | Generate audio file |

</details>

---

## Configuration

<details>
<summary><b>Environment Variables</b></summary>

### VOICEVOX Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `VOICEVOX_URL` | Engine URL | `http://localhost:50021` |
| `VOICEVOX_DEFAULT_SPEAKER` | Default speaker ID | `1` |
| `VOICEVOX_DEFAULT_SPEED_SCALE` | Playback speed | `1.0` |

### Playback Options

| Variable | Description | Default |
|----------|-------------|---------|
| `VOICEVOX_USE_STREAMING` | Streaming playback (requires `ffplay`) | `false` |
| `VOICEVOX_DEFAULT_IMMEDIATE` | Immediate playback | `true` |
| `VOICEVOX_DEFAULT_WAIT_FOR_START` | Wait for playback start | `false` |
| `VOICEVOX_DEFAULT_WAIT_FOR_END` | Wait for playback end | `false` |

### Restriction Settings

Restrict AI from specifying certain options.

| Variable | Description |
|----------|-------------|
| `VOICEVOX_RESTRICT_IMMEDIATE` | Restrict `immediate` option |
| `VOICEVOX_RESTRICT_WAIT_FOR_START` | Restrict `waitForStart` option |
| `VOICEVOX_RESTRICT_WAIT_FOR_END` | Restrict `waitForEnd` option |

### Disable Tools

```bash
# Disable unnecessary tools
export VOICEVOX_DISABLED_TOOLS=generate_query,synthesize_file
```

### Server Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_HTTP_MODE` | Enable HTTP mode | `false` |
| `MCP_HTTP_PORT` | HTTP port | `3000` |
| `MCP_HTTP_HOST` | HTTP host | `0.0.0.0` |
| `MCP_ALLOWED_HOSTS` | Allowed hosts (comma-separated) | `localhost,127.0.0.1,[::1]` |
| `MCP_ALLOWED_ORIGINS` | Allowed origins (comma-separated) | `http://localhost,http://127.0.0.1,...` |

</details>

<details>
<summary><b>Command Line Arguments</b></summary>

Command line arguments take priority over environment variables.

```bash
# Basic settings
npx @kajidog/mcp-tts-voicevox --url http://192.168.1.100:50021 --speaker 3 --speed 1.2

# HTTP mode
npx @kajidog/mcp-tts-voicevox --http --port 8080

# With restrictions
npx @kajidog/mcp-tts-voicevox --restrict-immediate --restrict-wait-for-end

# Disable tools
npx @kajidog/mcp-tts-voicevox --disable-tools generate_query,synthesize_file
```

| Argument | Description |
|----------|-------------|
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |
| `--url <value>` | VOICEVOX Engine URL |
| `--speaker <value>` | Default speaker ID |
| `--speed <value>` | Playback speed |
| `--use-streaming` / `--no-use-streaming` | Streaming playback |
| `--immediate` / `--no-immediate` | Immediate playback |
| `--wait-for-start` / `--no-wait-for-start` | Wait for start |
| `--wait-for-end` / `--no-wait-for-end` | Wait for end |
| `--restrict-immediate` | Restrict immediate |
| `--restrict-wait-for-start` | Restrict waitForStart |
| `--restrict-wait-for-end` | Restrict waitForEnd |
| `--disable-tools <tools>` | Disable tools |
| `--http` | HTTP mode |
| `--port <value>` | HTTP port |
| `--host <value>` | HTTP host |
| `--allowed-hosts <hosts>` | Allowed hosts (comma-separated) |
| `--allowed-origins <origins>` | Allowed origins (comma-separated) |

</details>

<details>
<summary><b>HTTP Mode</b></summary>

For remote connections:

**Start Server:**

```bash
# Linux/macOS
MCP_HTTP_MODE=true MCP_HTTP_PORT=3000 npx @kajidog/mcp-tts-voicevox

# Windows PowerShell
$env:MCP_HTTP_MODE='true'; $env:MCP_HTTP_PORT='3000'; npx @kajidog/mcp-tts-voicevox
```

**Claude Desktop Config (using mcp-remote):**

```json
{
  "mcpServers": {
    "tts-mcp-proxy": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

### Per-Project Speaker Settings

With Claude Code, you can configure different default speakers per project using custom headers in `.mcp.json`:

| Header | Description |
|--------|-------------|
| `X-Voicevox-Speaker` | Default speaker ID for this project |

**Example `.mcp.json`:**

```json
{
  "mcpServers": {
    "tts": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-Voicevox-Speaker": "113"
      }
    }
  }
}
```

This allows each project to use a different voice character automatically.

**Priority order:**
1. Explicit `speaker` parameter in tool call (highest)
2. Project default from `X-Voicevox-Speaker` header
3. Global `VOICEVOX_DEFAULT_SPEAKER` setting (lowest)

</details>

<details>
<summary><b>WSL to Windows Host Connection</b></summary>

Connecting from WSL to an MCP server running on Windows:

### 1. Get Windows Host IP from WSL

```bash
# Method 1: From default gateway
ip route show | grep -oP 'default via \K[\d.]+'
# Usually in the format 172.x.x.1

# Method 2: From /etc/resolv.conf (WSL2)
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
```

### 2. Start Server on Windows

Add the WSL gateway IP to `MCP_ALLOWED_HOSTS` to allow access from WSL:

```powershell
$env:MCP_HTTP_MODE='true'
$env:MCP_ALLOWED_HOSTS='localhost,127.0.0.1,172.29.176.1'
npx @kajidog/mcp-tts-voicevox
```

Or with CLI arguments:

```powershell
npx @kajidog/mcp-tts-voicevox --http --allowed-hosts "localhost,127.0.0.1,172.29.176.1"
```

### 3. WSL Configuration (.mcp.json)

```json
{
  "mcpServers": {
    "tts": {
      "type": "http",
      "url": "http://172.29.176.1:3000/mcp"
    }
  }
}
```

> ⚠️ Within WSL, `localhost` refers to WSL itself. Use the WSL gateway IP to access the Windows host.

</details>

---

## Troubleshooting

<details>
<summary><b>Audio is not playing</b></summary>

**1. Check if VOICEVOX Engine is running**

```bash
curl http://localhost:50021/speakers
```

**2. Check platform-specific playback tools**

| OS | Required Tool |
|----|---------------|
| Linux | One of `aplay`, `paplay`, `play`, `ffplay` |
| macOS | `afplay` (pre-installed) |
| Windows | PowerShell (pre-installed) |

</details>

<details>
<summary><b>Not recognized by MCP client</b></summary>

- Check package installation: `npm list -g @kajidog/mcp-tts-voicevox`
- Verify JSON syntax in config file
- Restart the client

</details>

---

## Package Structure

| Package | Description |
|---------|-------------|
| `@kajidog/mcp-tts-voicevox` | MCP server |
| [`@kajidog/voicevox-client`](https://www.npmjs.com/package/@kajidog/voicevox-client) | General-purpose VOICEVOX client library (can be used independently) |

---

<details>
<summary><b>Developer Information</b></summary>

### Setup

```bash
git clone https://github.com/kajidog/mcp-tts-voicevox.git
cd mcp-tts-voicevox
pnpm install
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests |
| `pnpm lint` | Run lint |
| `pnpm dev` | Start dev server |
| `pnpm dev:stdio` | Dev with stdio mode |
| `pnpm dev:bun` | Start dev server with Bun |
| `pnpm dev:bun:http` | Start HTTP dev server with Bun |

</details>

---

## License

ISC