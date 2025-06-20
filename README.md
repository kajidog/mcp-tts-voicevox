# MCP TTS VOICEVOX

VOICEVOX を使用した音声合成 MCP サーバー

## 特徴

- **キュー管理機能** - 複数の音声合成リクエストを効率的に処理
- **プリフェッチ** - 次の音声を事前に生成し、再生をスムーズに
- **クロスプラットフォーム対応** - Windows、macOS で動作
- **Stdio 対応** - 標準入出力による MCP プロトコル通信（Claude Desktop 等で推奨）
- **SSE 対応** - Server-Sent Events によるリアルタイム対話形式音声再生
- **StreamableHTTP 対応** - ストリーミング形式での HTTP 通信による高速音声合成
- **対話形式音声再生** - チャット形式でのリアルタイム音声合成・再生機能
- **複数話者対応** - セグメント単位での個別話者指定が可能
- **テキスト自動分割** - 長文の自動分割による安定した音声合成
- **独立したクライアントライブラリ** - [`@kajidog/voicevox-client`](https://www.npmjs.com/package/@kajidog/voicevox-client) として別パッケージで提供

## 必要条件

- Node.js 18.0.0 以上
- [VOICEVOX エンジン](https://voicevox.hiroshiba.jp/) または互換エンジン

## インストール

```bash
npm install -g @kajidog/mcp-tts-voicevox
```

## 使い方

### MCP サーバーとして

#### 1. VOICEVOX エンジンを起動

VOICEVOX エンジンを起動し、デフォルトポート（`http://localhost:50021`）で待機状態にします。

#### 2. MCP サーバーを起動

**標準入出力モード（推奨）:**

```bash
npx @kajidog/mcp-tts-voicevox
```

**HTTP サーバーモード:**

```bash
# Linux/macOS
MCP_HTTP_MODE=true npx @kajidog/mcp-tts-voicevox

# Windows PowerShell
$env:MCP_HTTP_MODE='true'; npx @kajidog/mcp-tts-voicevox
```

### MCP ツール一覧

MCP サーバーは以下のツールを提供します：

#### `speak` - テキスト読み上げ

テキストを音声に変換して再生します。

**パラメータ:**

- `text`: 文字列（改行区切りで複数テキスト、話者指定は「1:テキスト」形式）
- `speaker` (オプション): 話者 ID
- `speedScale` (オプション): 再生速度
- `query` (オプション): 事前生成済みクエリ

**使用例:**

```javascript
// シンプルなテキスト
{ "text": "こんにちは\n今日はいい天気ですね" }

// 話者指定
{ "text": "こんにちは\n今日はいい天気ですね", "speaker": 3 }

// セグメント別話者指定
{ "text": "1:こんにちは\n3:今日はいい天気ですね" }
```

#### `generate_query` - クエリ生成

音声合成用クエリを生成します。

**パラメータ:**

- `text`: 合成するテキスト
- `speaker` (オプション): 話者 ID
- `speedScale` (オプション): 再生速度

#### `synthesize_file` - ファイル生成

音声ファイルを生成し、パスを返します。

**パラメータ:**

- `text` (オプション): 合成するテキスト
- `query` (オプション): 事前生成済みクエリ
- `output`: 出力ファイルパス
- `speaker` (オプション): 話者 ID
- `speedScale` (オプション): 再生速度

#### `stop_speaker` - 再生停止

現在の音声合成キューをクリアします。

#### `get_speakers` - 話者一覧取得

利用可能な話者一覧を取得します。

#### `get_speaker_detail` - 話者詳細取得

指定した UUID の話者詳細情報を取得します。

**パラメータ:**

- `uuid`: 話者 UUID

### 対話形式音声再生の使用例

#### StreamableHTTP を使用した対話形式再生

```javascript
// セッション初期化
const response = await fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
    },
    id: 1,
  }),
});

const sessionData = await response.json();
const sessionId = response.headers.get("mcp-session-id");

// 音声合成・再生リクエスト
const speakResponse = await fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "mcp-session-id": sessionId,
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "speak",
      arguments: {
        text: "こんにちは、対話形式で音声を再生します",
        speaker: 1,
        speedScale: 1.0,
      },
    },
    id: 2,
  }),
});

const result = await speakResponse.json();
console.log("結果:", result);
```

#### 複数話者を使用した対話例

```javascript
// 複数話者での会話例
const conversationResponse = await fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "mcp-session-id": sessionId,
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "speak",
      arguments: {
        text: "1:こんにちは！\n3:お元気ですか？\n1:とても元気です！",
      },
    },
    id: 3,
  }),
});
```

#### SSE を使用した対話形式再生（レガシー）

```javascript
// SSE接続の確立
const eventSource = new EventSource("http://localhost:3000/sse");
let sessionId = null;

eventSource.onopen = function (event) {
  console.log("SSE接続が確立されました");
};

eventSource.onmessage = function (event) {
  const data = JSON.parse(event.data);

  if (data.type === "session") {
    sessionId = data.sessionId;
    console.log("セッションID:", sessionId);

    // 音声合成リクエストを送信
    sendSpeakRequest();
  }
};

async function sendSpeakRequest() {
  await fetch(`http://localhost:3000/messages?sessionId=${sessionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "speak",
        arguments: {
          text: "SSEを使用した音声再生です",
          speaker: 1,
        },
      },
      id: 1,
    }),
  });
}
```


## パッケージ構成

このプロジェクトは以下の2つのパッケージで構成されています：

### @kajidog/mcp-tts-voicevox (このパッケージ)
- **MCPサーバー** - Claude Desktop等のMCPクライアントと通信するサーバー
- **Node.js専用** - デスクトップ環境やCLI環境での使用を想定
- **ツール提供** - `speak`, `generate_query`, `synthesize_file` 等のMCPツール
- **HTTPサーバー** - SSE/StreamableHTTP対応のWebサーバー

### [@kajidog/voicevox-client](https://www.npmjs.com/package/@kajidog/voicevox-client) (独立パッケージ)
- **汎用ライブラリ** - VOICEVOXエンジンとの通信機能を提供
- **クロスプラットフォーム** - Node.js とブラウザ環境の両方で動作
- **キュー管理** - 複数の音声合成リクエストを効率的に処理
- **プリフェッチ機能** - 次の音声を事前に生成し、再生をスムーズに

### 使い分けガイド

**MCPサーバーを使用する場合 (`@kajidog/mcp-tts-voicevox`)**:
- Claude Desktop でTTSツールを使いたい
- コマンドラインからMCPサーバーを起動したい
- Webアプリケーション向けのHTTP APIが必要

**クライアントライブラリを使用する場合 (`@kajidog/voicevox-client`)**:
- 独自のNode.jsアプリケーションにTTS機能を組み込みたい
- ブラウザアプリケーションでVOICEVOXを使いたい
- MCPプロトコルを使わずに直接VOICEVOX機能を利用したい

詳細な使用方法は [`@kajidog/voicevox-client` のドキュメント](https://www.npmjs.com/package/@kajidog/voicevox-client) を参照してください。

## MCP 設定例

### Claude Desktop での設定

**⚠️ 重要: Claude Desktop の通信モードについて**

Claude Desktop は現在 **Stdio モードのみ** をサポートしており、SSE/HTTP モードは直接サポートされていません。

#### 推奨設定（Stdio モード）

`claude_desktop_config.json` ファイルに以下の設定を追加：

```json
{
  "mcpServers": {
    "tts-mcp": {
      "command": "npx",
      "args": ["-y", "@kajidog/mcp-tts-voicevox"],
    }
  }
}
```

#### SSE モードが必要な場合

SSE モードでの音声合成が必要な場合は、`mcp-remote` を使用して SSE↔Stdio 変換を行えます：

1. **Claude Desktop 設定**

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

2. **SSE サーバーの起動**

   **Mac/Linux:**

   ```bash
   MCP_HTTP_MODE=true MCP_HTTP_PORT=3000 npx @kajidog/mcp-tts-voicevox
   ```

   **Windows:**

   ```powershell
   $env:MCP_HTTP_MODE='true'; $env:MCP_HTTP_PORT='3000'; npx @kajidog/mcp-tts-voicevox
   ```

### AivisSpeech での設定例

```json
{
  "mcpServers": {
    "tts-mcp": {
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

### HTTP モードでの設定

```json
{
  "mcpServers": {
    "tts-mcp-http": {
      "command": "npx",
      "args": ["-y", "@kajidog/mcp-tts-voicevox"],
      "env": {
        "MCP_HTTP_MODE": "true",
        "MCP_HTTP_PORT": "3000",
        "MCP_HTTP_HOST": "0.0.0.0",
        "VOICEVOX_URL": "http://localhost:50021",
        "VOICEVOX_DEFAULT_SPEAKER": "1"
      }
    }
  }
}
```

## 環境変数

### VOICEVOX 設定

- `VOICEVOX_URL`: VOICEVOX エンジンの URL（デフォルト: `http://localhost:50021`）
- `VOICEVOX_DEFAULT_SPEAKER`: デフォルト話者 ID（デフォルト: `1`）
- `VOICEVOX_DEFAULT_SPEED_SCALE`: デフォルト再生速度（デフォルト: `1.0`）

### サーバー設定

- `MCP_HTTP_MODE`: HTTP サーバーモードの有効化（`true` で有効）
- `MCP_HTTP_PORT`: HTTP サーバーのポート番号（デフォルト: `3000`）
- `MCP_HTTP_HOST`: HTTP サーバーのホスト（デフォルト: `0.0.0.0`）
- `NODE_ENV`: 開発モード（`development` で有効）

## トラブルシューティング

### よくある問題

1. **VOICEVOX エンジンが起動していない**

   ```bash
   curl http://localhost:50021/speakers
   ```

2. **ポートが既に使用されている (EADDRINUSE エラー)**

   - 別のポート番号を使用するか、既存のプロセスを終了してください

3. **MCP クライアントで認識されない**

   - パッケージのインストールを確認：`npm list -g @kajidog/mcp-tts-voicevox`
   - 設定ファイルの JSON 構文を確認

4. **音声が再生されない**
   - システムの音声出力デバイスを確認
   - VOICEVOX エンジンの動作確認：
     ```bash
     curl -X POST "http://localhost:50021/audio_query?text=テスト&speaker=1"
     ```

## ライセンス

ISC

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/kajidog-mcp-tts-voicevox-badge.png)](https://mseep.ai/app/kajidog-mcp-tts-voicevox)
