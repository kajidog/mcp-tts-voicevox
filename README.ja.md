# VOICEVOX TTS MCP

[English](README.md) | **日本語**

VOICEVOX を使用した MCP テキスト読み上げサーバー

> 🎮 **[ブラウザデモを試す](https://kajidog.github.io/mcp-tts-voicevox/)** — VoicevoxClient をブラウザで直接テスト

## 何ができるか

- **AI アシスタントに喋らせる** — Claude Desktop などの MCP クライアントからテキストを読み上げ
- **UI オーディオプレーヤー（MCP Apps）** — チャット内で直接音声を再生できるインタラクティブプレーヤー（ChatGPT / Claude Desktop / Claude Web版 などが対応）
- **複数キャラクターの会話** — 1 回の呼び出しでセグメントごとに話者を切り替え可能
- **スムーズな再生** — キュー管理、即時再生、先読み、ストリーミング再生
- **クロスプラットフォーム** — Windows, macOS, Linux（WSL 含む）で動作

## UI オーディオプレーヤー（MCP Apps）

![再生プレーヤー](docs/images/player.png)

`voicevox_speak_player` ツールは [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) を使用して、チャット内にインタラクティブなオーディオプレーヤーを表示します。通常の `voicevox_speak` ツールがサーバー側で音声を再生するのに対し、**音声はクライアント側（ブラウザ/アプリ内）で再生されます** — サーバーに音声デバイスは不要です。

### 特徴

- **クライアント側再生** — 音声はサーバーではなく Claude Desktop のチャット内で再生。リモート接続でも動作します。
- **再生コントロール** — 再生/一時停止などの操作が会話内に埋め込まれます
- **マルチスピーカー対話** — 複数話者の会話を1つのプレーヤーでトラック切り替えしながら順次再生
- **スピーカー変更** — プレーヤー UI から直接、任意のセグメントの声を変更可能
- **セグメント編集** — 速度・音量・抑揚・間の長さ・前後無音をセグメントごとに調整
- **アクセント句編集** — アクセント位置・モーラピッチを UI 上で直接編集
- **トラックの追加 / 削除 / 並び替え** — ドラッグ＆ドロップによる並び替え、インラインでセグメント追加
- **WAV エクスポート** — 全トラックを番号付き WAV ファイルとして保存し、保存先フォルダを自動で開く
- **ユーザー辞書管理** — VOICEVOX ユーザー辞書の追加・編集・削除とプレビュー再生
- **セッション横断の状態復元** — プレーヤー状態はサーバー側に永続化され、チャットを開き直しても復元されます

エクスポートの環境差分:
- `保存して開く` は常に WAV 保存を実行します。ファイラー起動に非対応の環境でも保存は成功し、保存先パスを UI に表示します。
- `保存先を指定` は Windows/macOS ではネイティブのフォルダ選択ダイアログを使用します。非対応環境では既定の保存先にフォールバックします。

| 再生プレーヤー | トラックリスト | セグメント編集 |
|:---:|:---:|:---:|
| ![再生プレーヤー](docs/images/multi-player.png) | ![トラックリスト](docs/images/list-player.png) | ![セグメント編集](docs/images/edit-player.png) |

| スピーカー変更 | ユーザー辞書 | WAV エクスポート |
|:---:|:---:|:---:|
| ![スピーカー変更](docs/images/select-player.png) | ![ユーザー辞書](docs/images/dictionary-player.png) | ![WAV エクスポート](docs/images/export-player.png) |

### 対応クライアント

| クライアント | 接続方式 | 備考 |
|------------|---------|------|
| **ChatGPT** | HTTP（リモート） | `VOICEVOX_PLAYER_DOMAIN` の設定が必要 |
| **Claude Desktop** | stdio（ローカル） | そのまま動作 |
| **Claude Desktop** | HTTP（mcp-remote 経由） | `VOICEVOX_PLAYER_DOMAIN` は設定しないこと |

> **注意:** `speak_player` は MCP Apps 対応ホストが必要です。MCP Apps 非対応のホストでは利用できないため、代わりに `speak`（サーバー側再生）を使用してください。

### プレーヤー MCP ツール一覧

| ツール | 説明 |
|--------|------|
| `speak_player` | 新しいプレーヤーセッションを作成して UI を表示。`viewUUID` を返します。 |
| `resynthesize_player` | 既存プレーヤーの全セグメントを更新します（毎回新しい `viewUUID` を生成）。 |
| `get_player_state` | AI チューニング用にプレーヤーの現在状態をページ単位で取得します（読み取り専用）。 |
| `open_dictionary_ui` | ユーザー辞書管理 UI を開きます。 |

## クイックスタート

### 必要なもの

- Node.js 18.0.0 以上（または Bun）**または Docker**
- [VOICEVOX Engine](https://voicevox.hiroshiba.jp/)（起動しておく。Docker Compose に含まれています）
- ffplay（任意・推奨。Docker の場合は不要）

#### FFplay の導入

ffplay は FFmpeg に同梱される小型プレイヤーで、標準入力からの再生に対応します。導入済みの環境では、低遅延で安定したストリーミング再生を自動的に使用します。

> 💡 **ffplay がなくても動作します。** その場合は一時ファイル経由の再生（Windows: PowerShell、macOS: afplay、Linux: aplay 等）にフォールバックします。

- 導入は簡単: 各 OS でワンライナーのセットアップ（下記手順）
- 必須事項: `ffplay` に PATH が通っている必要があります（導入後に端末/アプリ再起動）

<details>
<summary>FFplay の導入手順と PATH 反映</summary>

インストール例:

- Windows（いずれか）
  - Winget: `winget install --id=Gyan.FFmpeg -e`
  - Chocolatey: `choco install ffmpeg`
  - Scoop: `scoop install ffmpeg`
  - 公式ビルド（例）: https://www.gyan.dev/ffmpeg/builds/ または https://github.com/BtbN/FFmpeg-Builds から zip を取得し、`bin` フォルダを PATH に追加

- macOS
  - Homebrew: `brew install ffmpeg`

- Linux
  - Debian/Ubuntu: `sudo apt-get update && sudo apt-get install -y ffmpeg`
  - Fedora: `sudo dnf install -y ffmpeg`
  - Arch: `sudo pacman -S ffmpeg`

PATH の反映:

- Windows: 環境変数に `...\ffmpeg\bin` を追加後、PowerShell/端末・エディタ（Claude/VS Code 等）を再起動。
  - 反映確認: `powershell -c "$env:Path"` に ffmpeg のパスが含まれること
- macOS/Linux: 通常は自動反映。必要に応じて `echo $PATH` で確認し、シェルを再起動。
- MCP クライアント（Claude Desktop/Code）: アプリ側のプロセス再起動で PATH を再読込します。

動作確認:

```bash
ffplay -version
```

バージョン情報が表示されれば導入完了です。CLI/MCP は自動的に ffplay を検出して標準入力ストリーミング再生を使用します。

</details>


### 3 ステップで開始

**1. VOICEVOX Engine を起動**

**2. Claude Desktop の設定ファイルに追加**

設定ファイルの場所:
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

**3. Claude Desktop を再起動**

これだけで Claude に「〇〇と喋って」と頼めば喋ってくれます！

### Docker でクイックスタート

Docker Compose を使えば、MCP サーバーと VOICEVOX Engine をまとめて起動できます。Node.js や VOICEVOX のインストールは不要です。

**1. コンテナを起動**

```bash
docker compose up -d
```

VOICEVOX Engine と MCP サーバー（HTTP モード、ポート 3000）が起動します。

**2. Claude Desktop の設定ファイルに追加（mcp-remote 使用）**

```json
{
  "mcpServers": {
    "tts-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

**3. Claude Desktop を再起動**

> **制限事項（Docker）:** Docker コンテナには音声デバイスがないため、`voicevox_speak` ツール（サーバー側再生）はデフォルトで無効化されています。代わりに `voicevox_speak_player` を使用してください。`voicevox_speak_player` はクライアント側（Claude Desktop 内）で音声を再生するため、サーバーに音声デバイスがなくても動作します。詳細は [UI オーディオプレーヤー](#ui-オーディオプレーヤーmcp-apps) をご覧ください。

---

## MCP ツール

### `voicevox_speak` — テキスト読み上げ

Claude から呼び出せるメインの機能です。

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `text` | 読み上げるテキスト（改行で複数セグメント） | 必須 |
| `speaker` | 話者 ID | 1 |
| `speedScale` | 再生速度 | 1.0 |
| `immediate` | 即時再生（キューをクリア） | true |
| `waitForEnd` | 再生完了まで待機 | false |

**使用例：**

```javascript
// シンプルなテキスト
{ "text": "こんにちは" }

// 話者を指定
{ "text": "こんにちは", "speaker": 3 }

// セグメントごとに話者を変更
{ "text": "1:こんにちは\n3:今日はいい天気ですね" }

// 再生完了まで待機（同期処理）
{ "text": "このメッセージを読み終えてから次へ", "waitForEnd": true }
```

<details>
<summary>その他のツール</summary>

| ツール | 説明 |
|--------|------|
| `voicevox_speak_player` | UI 音声プレイヤー付き読み上げ（`--disable-tools` で無効化可） |
| `voicevox_ping` | VOICEVOX Engine への接続確認 |
| `voicevox_get_speakers` | 利用可能な話者一覧を取得 |
| `voicevox_stop_speaker` | 再生停止とキューのクリア |
| `voicevox_synthesize_file` | 音声ファイルを生成 |

</details>

---

## 設定

<details>
<summary><b>環境変数で設定</b></summary>

### VOICEVOX 設定

| 環境変数 | 説明 | デフォルト |
|---------|------|-----------|
| `VOICEVOX_URL` | Engine の URL | `http://localhost:50021` |
| `VOICEVOX_DEFAULT_SPEAKER` | デフォルト話者 ID | `1` |
| `VOICEVOX_DEFAULT_SPEED_SCALE` | 再生速度 | `1.0` |

### 再生オプション

| 環境変数 | 説明 | デフォルト |
|---------|------|-----------|
| `VOICEVOX_USE_STREAMING` | ストリーミング再生（`ffplay` 必要） | `false` |
| `VOICEVOX_DEFAULT_IMMEDIATE` | 即時再生 | `true` |
| `VOICEVOX_DEFAULT_WAIT_FOR_START` | 再生開始まで待機 | `false` |
| `VOICEVOX_DEFAULT_WAIT_FOR_END` | 再生完了まで待機 | `false` |

### 制限設定

AI が特定のオプションを指定できないように制限できます。

| 環境変数 | 説明 |
|---------|------|
| `VOICEVOX_RESTRICT_IMMEDIATE` | `immediate` オプションを制限 |
| `VOICEVOX_RESTRICT_WAIT_FOR_START` | `waitForStart` オプションを制限 |
| `VOICEVOX_RESTRICT_WAIT_FOR_END` | `waitForEnd` オプションを制限 |

### ツールの無効化

```bash
# 個別のツールを無効化
export VOICEVOX_DISABLED_TOOLS=speak_player,synthesize_file

# ツールグループをまとめて無効化
export VOICEVOX_DISABLED_GROUPS=player

# グループと個別を組み合わせ
export VOICEVOX_DISABLED_GROUPS=dictionary
export VOICEVOX_DISABLED_TOOLS=synthesize_file
```

`VOICEVOX_DISABLED_GROUPS` / `--disable-groups` で使えるビルトイングループ:

| グループ | 含まれるツール |
|---------|--------------|
| `player` | `speak_player`, `resynthesize_player`, `get_player_state`, `open_dictionary_ui` |
| `dictionary` | `get_accent_phrases`, `get_user_dictionary`, `add_user_dictionary_word`, `update_user_dictionary_word`, `delete_user_dictionary_word`, `add_user_dictionary_words`, `update_user_dictionary_words` |
| `file` | `synthesize_file` |
| `apps` | `speak_player`, `resynthesize_player`, `open_dictionary_ui`（MCP App UI ツール） |

### UI プレイヤー設定

| 環境変数 | 説明 | デフォルト |
|---------|------|-----------|
| `VOICEVOX_PLAYER_DOMAIN` | UI プレーヤーのウィジェットドメイン（ChatGPT 使用時に必要。例: `https://your-app.onrender.com`） | _(未設定)_ |
| `VOICEVOX_AUTO_PLAY` | UI プレイヤーで自動再生 | `true` |
| `VOICEVOX_PLAYER_EXPORT_ENABLED` | UI プレイヤーからのトラック書き出し（ダウンロード）を有効化（`false` で無効化） | `true` |
| `VOICEVOX_PLAYER_EXPORT_DIR` | トラック書き出し先のデフォルトディレクトリ（フォルダ選択非対応環境でのフォールバック先としても使用） | `./voicevox-player-exports` |
| `VOICEVOX_PLAYER_CACHE_DIR` | プレーヤーのキャッシュファイル（`*.txt`）と状態ファイルの既定保存先 | `./.voicevox-player-cache` |
| `VOICEVOX_PLAYER_AUDIO_CACHE_ENABLED` | 音声キャッシュのディスク永続化を有効化（`false` でディスク保存/読み込みを無効化） | `true` |
| `VOICEVOX_PLAYER_AUDIO_CACHE_TTL_DAYS` | 音声キャッシュ保持日数（`0`: ディスクキャッシュ無効、`-1`: 期限削除なし） | `30` |
| `VOICEVOX_PLAYER_AUDIO_CACHE_MAX_MB` | 音声キャッシュ上限サイズ MB（`0`: ディスクキャッシュ無効、`-1`: 無制限） | `512` |
| `VOICEVOX_PLAYER_STATE_FILE` | プレーヤー状態 JSON の保存パス | `<VOICEVOX_PLAYER_CACHE_DIR>/player-state.json` |

### サーバー設定

| 環境変数 | 説明 | デフォルト |
|---------|------|-----------|
| `MCP_HTTP_MODE` | HTTP モードを有効化 | `false` |
| `MCP_HTTP_PORT` | HTTP ポート | `3000` |
| `MCP_HTTP_HOST` | HTTP ホスト | `0.0.0.0` |
| `MCP_ALLOWED_HOSTS` | 許可するホスト（カンマ区切り） | `localhost,127.0.0.1,[::1]` |
| `MCP_ALLOWED_ORIGINS` | 許可するオリジン（カンマ区切り） | `http://localhost,http://127.0.0.1,...` |
| `MCP_API_KEY` | `/mcp` に必須の API キー（`X-API-Key` または `Authorization: Bearer` で送信） | _(未設定)_ |

</details>

<details>
<summary><b>コマンドライン引数で設定</b></summary>

コマンドライン引数は環境変数より優先されます。

```bash
# 基本設定
npx @kajidog/mcp-tts-voicevox --url http://192.168.1.100:50021 --speaker 3 --speed 1.2

# HTTP モード
npx @kajidog/mcp-tts-voicevox --http --port 8080

# 制限付き
npx @kajidog/mcp-tts-voicevox --restrict-immediate --restrict-wait-for-end

# 個別ツールを無効化
npx @kajidog/mcp-tts-voicevox --disable-tools speak_player,synthesize_file

# グループをまとめて無効化
npx @kajidog/mcp-tts-voicevox --disable-groups player
```

| 引数 | 説明 |
|------|------|
| `--help`, `-h` | ヘルプを表示 |
| `--version`, `-v` | バージョンを表示 |
| `--init` | デフォルト設定の `.voicevoxrc.json` を生成 |
| `--config <path>` | 設定ファイルのパス |
| `--url <value>` | VOICEVOX Engine URL |
| `--speaker <value>` | デフォルト話者 ID |
| `--speed <value>` | 再生速度 |
| `--use-streaming` / `--no-use-streaming` | ストリーミング再生 |
| `--immediate` / `--no-immediate` | 即時再生 |
| `--wait-for-start` / `--no-wait-for-start` | 再生開始待機 |
| `--wait-for-end` / `--no-wait-for-end` | 再生完了待機 |
| `--restrict-immediate` | immediate を制限 |
| `--restrict-wait-for-start` | waitForStart を制限 |
| `--restrict-wait-for-end` | waitForEnd を制限 |
| `--disable-tools <tools>` | ツールを個別に無効化（カンマ区切り） |
| `--disable-groups <groups>` | ツールグループを無効化: `player`, `dictionary`, `file`, `apps` |
| `--auto-play` / `--no-auto-play` | UI プレイヤーで自動再生 |
| `--player-export` / `--no-player-export` | UI プレイヤーのトラック書き出し（ダウンロード）の有効/無効 |
| `--player-export-dir <dir>` | トラック書き出し先のデフォルトディレクトリ |
| `--player-cache-dir <dir>` | プレーヤーキャッシュディレクトリ |
| `--player-state-file <path>` | プレーヤー状態ファイルの保存パス |
| `--player-audio-cache` / `--no-player-audio-cache` | プレーヤー音声のディスクキャッシュ有効/無効 |
| `--player-audio-cache-ttl-days <days>` | 音声キャッシュ保持日数（`0`: 無効、`-1`: 期限削除なし） |
| `--player-audio-cache-max-mb <mb>` | 音声キャッシュ上限サイズMB（`0`: 無効、`-1`: 無制限） |
| `--http` | HTTP モード |
| `--port <value>` | HTTP ポート |
| `--host <value>` | HTTP ホスト |
| `--allowed-hosts <hosts>` | 許可するホスト（カンマ区切り） |
| `--allowed-origins <origins>` | 許可するオリジン（カンマ区切り） |
| `--api-key <key>` | `/mcp` に必須の API キー |

</details>

<details>
<summary><b>設定ファイル (.voicevoxrc.json)</b></summary>

環境変数やコマンドライン引数の代わりに（または併用して）JSON 設定ファイルを使用できます。多くの設定がある場合に便利です。

**優先順位:** CLI引数 > 環境変数 > 設定ファイル > デフォルト値

### 設定ファイルを生成

```bash
npx @kajidog/mcp-tts-voicevox --init
```

カレントディレクトリにデフォルト設定の `.voicevoxrc.json` を生成します。必要に応じて編集してください。

### カスタムパスの設定ファイルを使用

```bash
npx @kajidog/mcp-tts-voicevox --config ./my-config.json
```

環境変数でも指定可能:

```bash
VOICEVOX_CONFIG=./my-config.json npx @kajidog/mcp-tts-voicevox
```

### `.voicevoxrc.json` の例

```json
{
  "url": "http://192.168.1.50:50021",
  "speaker": 3,
  "speed": 1.2,
  "http": true,
  "port": 8080,
  "disable-tools": ["synthesize_file"],
  "disable-groups": ["dictionary"]
}
```

キー名は kebab-case（`use-streaming`）、camelCase（`useStreaming`）、内部キー名（`defaultSpeaker`）のいずれでも記述できます。カレントディレクトリに `.voicevoxrc.json` が存在する場合、自動的に読み込まれます。

</details>

<details>
<summary><b>HTTP モードで使う</b></summary>

リモート接続が必要な場合：

**サーバー起動：**

```bash
# Linux/macOS
MCP_HTTP_MODE=true MCP_HTTP_PORT=3000 npx @kajidog/mcp-tts-voicevox

# Windows PowerShell
$env:MCP_HTTP_MODE='true'; $env:MCP_HTTP_PORT='3000'; npx @kajidog/mcp-tts-voicevox
```

**Claude Desktop 設定（mcp-remote 使用）：**

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

### プロジェクトごとの話者設定

Claude Code では `.mcp.json` にカスタムヘッダーを設定することで、プロジェクトごとに異なるデフォルト話者を設定できます：

| ヘッダー | 説明 |
|---------|------|
| `X-Voicevox-Speaker` | このプロジェクトのデフォルト話者 ID |
| `X-API-Key` | `MCP_API_KEY` を設定した場合に必要な API キー |

**`.mcp.json` の例：**

```json
{
  "mcpServers": {
    "tts": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-Voicevox-Speaker": "113",
        "X-API-Key": "your-api-key"
      }
    }
  }
}
```

これにより、プロジェクトごとに自動的に異なる音声キャラクターを使い分けることができます。

**優先順位：**
1. ツール呼び出し時の `speaker` パラメータ（最高）
2. `X-Voicevox-Speaker` ヘッダーによるプロジェクトデフォルト
3. グローバルな `VOICEVOX_DEFAULT_SPEAKER` 設定（最低）

</details>

<details>
<summary><b>WSL から Windows ホストに接続</b></summary>

WSL 内から Windows で動作する MCP サーバーに接続する場合：

### 1. WSL 側で Windows ホストの IP を確認

```bash
# 方法1: デフォルトゲートウェイから取得
ip route show | grep -oP 'default via \K[\d.]+'
# 通常 172.x.x.1 の形式

# 方法2: /etc/resolv.conf から取得（WSL2）
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
```

### 2. Windows 側でサーバー起動

WSL からのアクセスを許可するため、`MCP_ALLOWED_HOSTS` に WSL ゲートウェイ IP を追加：

```powershell
$env:MCP_HTTP_MODE='true'
$env:MCP_ALLOWED_HOSTS='localhost,127.0.0.1,172.29.176.1'
npx @kajidog/mcp-tts-voicevox
```

または CLI 引数で：

```powershell
npx @kajidog/mcp-tts-voicevox --http --allowed-hosts "localhost,127.0.0.1,172.29.176.1"
```

### 3. WSL 側の設定（.mcp.json）

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

> ⚠️ WSL 内では `localhost` は WSL 自身を指すため、Windows ホストには WSL ゲートウェイ IP でアクセスします。

</details>

<details>
<summary><b>ChatGPT で使う</b></summary>

ChatGPT から使用するには、MCP サーバーを HTTP モードでクラウドにデプロイし、VOICEVOX Engine にアクセスできる状態にする必要があります。

### 1. クラウドにデプロイ

Render、Railway などに Docker でデプロイします（Dockerfile 同梱）。

### 2. VOICEVOX Engine を用意

ローカルで起動して ngrok 等で公開するか、クラウド上で一緒にデプロイします。

### 3. 環境変数を設定

| 環境変数 | 値の例 | 説明 |
|---------|--------|------|
| `VOICEVOX_URL` | `https://xxxx.ngrok-free.app` | VOICEVOX Engine の URL |
| `MCP_HTTP_MODE` | `true` | HTTP モードを有効化 |
| `MCP_ALLOWED_HOSTS` | `your-app.onrender.com` | デプロイ先のホスト名 |
| `VOICEVOX_PLAYER_DOMAIN` | `https://your-app.onrender.com` | UI プレーヤーのウィジェットドメイン（ChatGPT で必須） |
| `VOICEVOX_DISABLED_TOOLS` | `speak` | サーバー側再生を無効化（音声デバイスなし） |
| `VOICEVOX_PLAYER_EXPORT_ENABLED` | `false` | エクスポート機能を無効化（クラウド上ではファイルをダウンロードできないため） |

### 4. ChatGPT でコネクターを追加

ChatGPT の設定 → コネクター → MCP サーバーの URL（`https://your-app.onrender.com/mcp`）を追加します。

</details>

<details>
<summary><b>Web 版 Claude で使う</b></summary>

基本的な手順は ChatGPT と同じですが、`VOICEVOX_PLAYER_DOMAIN` の値が異なります。

Claude Web 版では `ui.domain` に **ハッシュベースの専用ドメイン** が必要です。以下のコマンドで計算できます：

```bash
node -e "console.log(require('crypto').createHash('sha256').update('あなたのMCPサーバーURL').digest('hex').slice(0,32)+'.claudemcpcontent.com')"
```

例：MCP サーバーの URL が `https://your-app.onrender.com/mcp` の場合：

```bash
node -e "console.log(require('crypto').createHash('sha256').update('https://your-app.onrender.com/mcp').digest('hex').slice(0,32)+'.claudemcpcontent.com')"
# 出力例: 48fb73a6...claudemcpcontent.com
```

この出力値を `VOICEVOX_PLAYER_DOMAIN` に設定してください。

> **注意**: ChatGPT と Claude Web 版では `VOICEVOX_PLAYER_DOMAIN` の値が異なるため、同じインスタンスで両方に対応することはできません。それぞれ別のインスタンスをデプロイするか、接続先に合わせて環境変数を切り替えてください。

</details>

---

## トラブルシューティング

<details>
<summary><b>音声が再生されない</b></summary>

**1. VOICEVOX Engine が起動しているか確認**

```bash
curl http://localhost:50021/speakers
```

**2. プラットフォーム別の再生ツールを確認**

| OS | 必要なツール |
|----|------------|
| Linux | `aplay`, `paplay`, `play`, `ffplay` のいずれか |
| macOS | `afplay`（プリインストール済み） |
| Windows | PowerShell（プリインストール済み） |

</details>

<details>
<summary><b>MCP クライアントに認識されない</b></summary>

- パッケージのインストール確認：`npm list -g @kajidog/mcp-tts-voicevox`
- 設定ファイルの JSON 構文をチェック
- クライアントを再起動

</details>

---

## パッケージ構成

| パッケージ | 説明 |
|-----------|------|
| `@kajidog/mcp-tts-voicevox` | MCP サーバー本体 |
| [`@kajidog/voicevox-client`](https://www.npmjs.com/package/@kajidog/voicevox-client) | 汎用 VOICEVOX クライアントライブラリ（独立使用可能） |
| `@kajidog/player-ui` | ブラウザ再生用の React 音声プレイヤー UI |

---

<details>
<summary><b>開発者向け情報</b></summary>

### セットアップ

```bash
git clone https://github.com/kajidog/mcp-tts-voicevox.git
cd mcp-tts-voicevox
pnpm install
```

### コマンド

| コマンド | 説明 |
|---------|------|
| `pnpm build` | 全パッケージをビルド |
| `pnpm test` | テスト実行 |
| `pnpm lint` | Lint 実行 |
| `pnpm dev` | 開発サーバー起動 |
| `pnpm dev:stdio` | Stdio モードで開発 |
| `pnpm dev:bun` | Bun で開発サーバー起動 |
| `pnpm dev:bun:http` | Bun で HTTP 開発サーバー起動 |

</details>

---

## ライセンス

ISC
