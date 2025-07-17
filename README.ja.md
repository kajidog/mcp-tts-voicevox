# MCP TTS VOICEVOX

[English](README.md) | **日本語**

VOICEVOX を使用した音声合成 MCP サーバー

## 特徴

- **高度な再生制御** - キュー管理・即時再生・同期/非同期制御による柔軟な音声処理
- **プリフェッチ** - 次の音声を事前に生成し、再生をスムーズに
- **クロスプラットフォーム対応** - Windows、macOS、Linux で動作（WSL環境での音声再生にも対応）
- **Stdio/HTTP 対応** - Stdio や SSE、StreamableHttp に対応
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

## MCP ツール

### `speak` - テキスト読み上げ

テキストを音声に変換して再生します。

**パラメータ:**

- `text`: 文字列（改行区切りで複数テキスト、話者指定は「1:テキスト」形式）
- `speaker` (オプション): 話者 ID
- `speedScale` (オプション): 再生速度
- `immediate` (オプション): 即座に再生開始するか（デフォルト: true）
- `waitForStart` (オプション): 再生開始まで待機するか（デフォルト: false）
- `waitForEnd` (オプション): 再生終了まで待機するか（デフォルト: false）

**使用例:**

```javascript
// シンプルなテキスト
{ "text": "こんにちは\n今日はいい天気ですね" }

// 話者指定
{ "text": "こんにちは", "speaker": 3 }

// セグメント別話者指定
{ "text": "1:こんにちは\n3:今日はいい天気ですね" }

// 即座に再生（キューを迂回）
{
  "text": "緊急メッセージです",
  "immediate": true,
  "waitForEnd": true
}

// 再生終了まで待機（同期処理）
{
  "text": "この音声の再生が完了するまで次の処理を待機",
  "waitForEnd": true
}

// キューに追加するが自動再生しない
{
  "text": "手動で再生開始するまで待機",
  "immediate": false
}
```

### 高度な再生制御機能

#### 即時再生（`immediate: true`）

キューを迂回して音声を即座に再生：

- **通常のキューと並行動作**: 既存のキュー再生を妨げません
- **複数同時再生**: 複数の即時再生を同時に実行可能
- **緊急通知に最適**: 重要なメッセージを優先的に再生

#### 同期再生制御（`waitForEnd: true`）

再生完了まで待機して処理を同期化：

- **順次処理**: 音声再生後に次の処理を実行
- **タイミング制御**: 音声と他の処理の連携が可能
- **UI 同期**: 画面表示と音声のタイミングを合わせる

```javascript
// 例1: 緊急メッセージを即座に再生し、完了まで待機
{
  "text": "緊急！すぐに確認してください",
  "immediate": true,
  "waitForEnd": true
}

// 例2: ステップバイステップの音声ガイド
{
  "text": "手順1: ファイルを開いてください",
  "waitForEnd": true
}
// 上記の音声が完了してから次の処理が実行される
```

### その他のツール

- `generate_query` - 音声合成用クエリを生成
- `synthesize_file` - 音声ファイルを生成
- `stop_speaker` - 再生停止・キュークリア
- `get_speakers` - 話者一覧取得
- `get_speaker_detail` - 話者詳細取得

## パッケージ構成

### @kajidog/mcp-tts-voicevox (このパッケージ)

- **MCP サーバー** - Claude Desktop 等の MCP クライアントと通信
- **HTTP サーバー** - SSE/StreamableHTTP によるリモート MCP 通信

### [@kajidog/voicevox-client](https://www.npmjs.com/package/@kajidog/voicevox-client) (独立パッケージ)

- **汎用ライブラリ** - VOICEVOX エンジンとの通信機能
- **クロスプラットフォーム** - Node.js、ブラウザ環境対応
- **高度な再生制御** - 即時再生・同期再生・キュー管理機能

## MCP 設定例

### Claude Desktop での設定

`claude_desktop_config.json` ファイルに以下の設定を追加：

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

````

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
````

## 環境変数

### VOICEVOX 設定

- `VOICEVOX_URL`: VOICEVOX エンジンの URL（デフォルト: `http://localhost:50021`）
- `VOICEVOX_DEFAULT_SPEAKER`: デフォルト話者 ID（デフォルト: `1`）
- `VOICEVOX_DEFAULT_SPEED_SCALE`: デフォルト再生速度（デフォルト: `1.0`）

### 再生オプション設定

- `VOICEVOX_DEFAULT_IMMEDIATE`: キュー追加時に即座に再生開始するか（デフォルト: `true`）
- `VOICEVOX_DEFAULT_WAIT_FOR_START`: 再生開始まで待機するか（デフォルト: `false`）
- `VOICEVOX_DEFAULT_WAIT_FOR_END`: 再生終了まで待機するか（デフォルト: `false`）

**使用例:**

```bash
# 例1: 全ての音声再生で完了まで待機（同期処理）
export VOICEVOX_DEFAULT_WAIT_FOR_END=true
npx @kajidog/mcp-tts-voicevox

# 例2: 再生開始と終了の両方を待機
export VOICEVOX_DEFAULT_WAIT_FOR_START=true
export VOICEVOX_DEFAULT_WAIT_FOR_END=true
npx @kajidog/mcp-tts-voicevox

# 例3: 手動制御（自動再生無効）
export VOICEVOX_DEFAULT_IMMEDIATE=false
npx @kajidog/mcp-tts-voicevox
```

これらのオプションにより、アプリケーションの要件に応じて音声再生の挙動を細かく制御できます。

### サーバー設定

- `MCP_HTTP_MODE`: HTTP サーバーモードの有効化（`true` で有効）
- `MCP_HTTP_PORT`: HTTP サーバーのポート番号（デフォルト: `3000`）
- `MCP_HTTP_HOST`: HTTP サーバーのホスト（デフォルト: `0.0.0.0`）

## WSL（Windows Subsystem for Linux）での使用

WSL環境から WindowsホストのMCPサーバーに接続する場合の設定方法です。

### 1. Windowsホストでの設定

**AivisSpeechとPowerShellでMCPサーバーを起動:**

```powershell
$env:MCP_HTTP_MODE='true'; $env:MCP_HTTP_PORT='3000'; $env:VOICEVOX_URL='http://127.0.0.1:10101'; $env:VOICEVOX_DEFAULT_SPEAKER='888753764'; npx @kajidog/mcp-tts-voicevox
```

### 2. WSL環境での設定

**WindowsホストのIPアドレスを確認:**

```bash
# WSLからWindowsホストのIPアドレスを取得
ip route show | grep default | awk '{print $3}'
```

通常は `172.x.x.1` の形式になります。

** Claude Code の .mcp.json の設定例:**

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

**重要なポイント:**
- WSL内では `localhost` や `127.0.0.1` はWSL内部を指すため、Windowsホストのサービスにはアクセスできません
- WSLのゲートウェイIP（通常 `172.x.x.1`）を使用してWindowsホストにアクセスします
- Windowsのファイアウォールでポートがブロックされていないことを確認してください

**接続テスト:**

```bash
# WSL内でWindowsホストのMCPサーバーへの接続確認
curl http://172.29.176.1:3000
```

正常な場合は `404 Not Found` が返されます（ルートパスが存在しないため）。

## トラブルシューティング

### よくある問題

1. **VOICEVOX エンジンが起動していない**

   ```bash
   curl http://localhost:50021/speakers
   ```

2. **音声が再生されない**

   - システムの音声出力デバイスを確認
   - プラットフォーム固有の音声再生ツールの確認：
     - **Linux**: `aplay`, `paplay`, `play`, `ffplay` のいずれかが必要
     - **macOS**: `afplay` (標準でインストール済み)
     - **Windows**: PowerShell (標準でインストール済み)

3. **MCP クライアントで認識されない**
   - パッケージのインストールを確認：`npm list -g @kajidog/mcp-tts-voicevox`
   - 設定ファイルの JSON 構文を確認

## ライセンス

ISC

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/kajidog-mcp-tts-voicevox-badge.png)](https://mseep.ai/app/kajidog-mcp-tts-voicevox)

## 開発者向け情報

このリポジトリをローカルで開発する場合の手順です。

### セットアップ

1.  リポジトリをクローンします:
    ```bash
    git clone https://github.com/kajidog/mcp-tts-voicevox.git
    cd mcp-tts-voicevox
    ```
2.  [pnpm](https://pnpm.io/) をインストールします。(まだインストールしていない場合)
3.  依存関係をインストールします:
    ```bash
    pnpm install
    ```

### 主要な開発コマンド

プロジェクトルートで以下のコマンドを実行できます。

-   **すべてのパッケージをビルド:**
    ```bash
    pnpm build
    ```
-   **すべてのテストを実行:**
    ```bash
    pnpm test
    ```
-   **すべてのリンターを実行:**
    ```bash
    pnpm lint
    ```
-   **ルートサーバーを開発モードで起動:**
    ```bash
    pnpm dev
    ```
-   **stdioインターフェースを開発モードで起動:**
    ```bash
    pnpm dev:stdio
    ```

これらのコマンドは、ワークスペース内の関連するパッケージに対しても適切に処理を実行します。