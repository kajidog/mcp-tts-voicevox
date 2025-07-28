# セットアップガイド

## 必要条件

- Node.js 18.0.0 以上
- VOICEVOX エンジンまたは互換エンジン

## インストール

### グローバルインストール
```bash
npm install -g @kajidog/mcp-tts-voicevox
```

### ローカルインストール
```bash
npm install @kajidog/mcp-tts-voicevox
```

## VOICEVOX エンジンの設定

### 1. VOICEVOX エンジンをダウンロード
[VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/)から最新版をダウンロード

### 2. エンジンを起動
```bash
# デフォルトポートで起動
./voicevox_engine
```

### 3. 動作確認
```bash
curl http://localhost:50021/speakers
```

## MCP サーバーの設定

### Claude Desktop での設定

`claude_desktop_config.json` ファイルに以下を追加：

```json
{
  "mcpServers": {
    "tts": {
      "command": "npx",
      "args": ["-y", "@kajidog/mcp-tts-voicevox"]
    }
  }
}
```

### Claude Code での設定

1. **HTTP サーバーを起動**
   ```bash
   MCP_HTTP_MODE=true npx @kajidog/mcp-tts-voicevox
   ```

2. **Claude Code に追加**
   ```bash
   claude mcp add --transport http tts http://127.0.0.1:3000/mcp
   ```

## 環境変数

### VOICEVOX エンジン設定
```bash
# エンジンのURL（デフォルト: http://localhost:50021）
export VOICEVOX_URL=http://localhost:50021

# デフォルト話者ID（デフォルト: 1）
export VOICEVOX_DEFAULT_SPEAKER=1

# デフォルト再生速度（デフォルト: 1.0）
export VOICEVOX_DEFAULT_SPEED_SCALE=1.0
```

### 再生制御設定
```bash
# 即座に再生開始するか（デフォルト: true）
export VOICEVOX_DEFAULT_IMMEDIATE=true

# 再生開始まで待機するか（デフォルト: false）
export VOICEVOX_DEFAULT_WAIT_FOR_START=false

# 再生終了まで待機するか（デフォルト: false）
export VOICEVOX_DEFAULT_WAIT_FOR_END=false
```

### サーバー設定
```bash
# HTTP サーバーモードを有効化
export MCP_HTTP_MODE=true

# HTTP サーバーのポート（デフォルト: 3000）
export MCP_HTTP_PORT=3000

# HTTP サーバーのホスト（デフォルト: 0.0.0.0）
export MCP_HTTP_HOST=0.0.0.0
```

## 他のTTSエンジンとの使用

### AivisSpeech
```json
{
  "mcpServers": {
    "tts": {
      "command": "npx",
      "args": ["-y", "@kajidog/mcp-tts-voicevox"],
      "env": {
        "VOICEVOX_URL": "http://127.0.0.1:10101",
        "VOICEVOX_DEFAULT_SPEAKER": "888753764"
      }
    }
  }
}
```

## トラブルシューティング

### よくある問題

1. **VOICEVOX エンジンが起動していない**
   ```bash
   curl http://localhost:50021/speakers
   ```
   エラーが出る場合はエンジンを起動してください。

2. **音声が再生されない**
   - システムの音声出力デバイスを確認
   - プラットフォーム固有のツールを確認：
     - Linux: `aplay`, `paplay`, `play`, `ffplay` のいずれかが必要
     - macOS: `afplay`（標準インストール済み）
     - Windows: PowerShell（標準インストール済み）

3. **MCP クライアントで認識されない**
   - パッケージのインストールを確認：`npm list -g @kajidog/mcp-tts-voicevox`
   - 設定ファイルの JSON 構文を確認

### ログの確認

#### Claude Desktop
```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Windows
# %APPDATA%\Claude\logs\ 内のログファイルを確認
```

#### HTTP モード
サーバー起動時にコンソールにログが出力されます。

### 接続テスト

#### HTTP モードの接続確認
```bash
curl http://localhost:3000
```
`404 Not Found` が返されれば正常です。

#### MCP エンドポイントの確認
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## WSL での使用

WSL 環境から Windows ホストの MCP サーバーに接続する場合：

### 1. Windows ホストでの設定
```powershell
$env:MCP_HTTP_MODE='true'
$env:MCP_HTTP_PORT='3000'
npx @kajidog/mcp-tts-voicevox
```

### 2. WSL での設定
```bash
# Windows ホストの IP アドレスを取得
ip route show | grep default | awk '{print $3}'
```

通常は `172.x.x.1` の形式になります。

### 3. Claude Code での設定
```bash
claude mcp add --transport http tts http://172.29.176.1:3000/mcp
```

**注意点:**
- WSL 内では `localhost` は WSL 内部を指します
- Windows ファイアウォールでポートがブロックされていないことを確認