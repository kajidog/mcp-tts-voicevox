[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/kajidog-mcp-tts-voicevox-badge.png)](https://mseep.ai/app/kajidog-mcp-tts-voicevox)

# MCP TTS VOICEVOX

VOICEVOX を使用した音声合成 MCP サーバー

## 特徴

- **キュー管理機能** - 複数の音声合成リクエストを効率的に処理
- **プリフェッチ** - 次の音声を事前に生成し、再生をスムーズに
- **クロスプラットフォーム対応** - Windows、macOS で動作
- **マルチ環境対応** - Node.js（ライブラリ/CLI）とブラウザの環境で利用可能
- **ファイルダウンロード機能** - ブラウザ環境での音声ファイル保存をサポート

## 必要条件

- Node.js
- [VOICEVOX エンジン](https://voicevox.hiroshiba.jp/)

## インストール

```bash
npm install -g @kajidog/mcp-tts-voicevox
```

## 使い方

### MCP サーバーとして

1. VOICEVOX エンジンを起動
2. MCP サーバーを起動

```bash
npx @kajidog/mcp-tts-voicevox
```

### ライブラリとして

プロジェクトに直接インポートして使用することも可能です：

```bash
npm install @kajidog/mcp-tts-voicevox
```

#### Node.js 環境での使用例

```javascript
import { VoicevoxClient } from "@kajidog/mcp-tts-voicevox";

// クライアントを初期化
const client = new VoicevoxClient({
  url: "http://localhost:50021", // VOICEVOXエンジンのURL
  defaultSpeaker: 1, // デフォルト話者ID（オプション）
  defaultSpeedScale: 1.0, // デフォルト速度（オプション）
});

// テキストを音声に変換して再生
await client.speak("こんにちは");

// テキストから音声ファイルを生成
const filePath = await client.generateAudioFile("こんにちは", "./output.wav");

// キューをクリア
await client.clearQueue();

// スピーカー一覧を取得
const speakers = await client.getSpeakers();

// スピーカー詳細を取得
const speakerInfo = await client.getSpeakerInfo(speakers[0].speaker_uuid);
```

#### ブラウザ環境での使用例

```javascript
import { VoicevoxClient } from "@kajidog/mcp-tts-voicevox";

// クライアントを初期化（VOICEVOXエンジンが稼働しているURLを指定）
const client = new VoicevoxClient({
  url: "http://localhost:50021",
  defaultSpeaker: 1,
});

// ボタンクリックでテキストを音声に変換して再生
document.querySelector("#playButton").addEventListener("click", async () => {
  await client.speak("こんにちは");
});

// ファイルダウンロードボタン
document
  .querySelector("#downloadButton")
  .addEventListener("click", async () => {
    try {
      // 音声ファイルを生成してダウンロード（ファイル名を指定）
      const filename = `voice-${Date.now()}.wav`;
      const result = await client.generateAudioFile("こんにちは", filename);
      console.log("ダウンロードしたファイル:", result);
    } catch (error) {
      console.error("エラー:", error);
    }
  });
```

## 主な機能

- **テキスト読み上げ** (`speak`) - テキストを音声に変換して再生
- **読み上げ停止** (`stop_speaker`) - 現在の音声合成キューをすべてクリア
- **クエリ生成** (`generate_query`) - 音声合成用クエリの作成
- **ファイル生成** (`synthesize_file`) - クエリから音声ファイルを生成
- **音声ファイルダウンロード** (`generateAudioFile`) - 音声ファイルを生成し、ブラウザでダウンロード
- **スピーカー一覧取得** (`get_speakers`) - 利用可能なスピーカー一覧を取得
- **スピーカー詳細取得** (`get_speaker_detail`) - スピーカー ID から詳細情報を取得

## MCP 設定例

`mcp.json`ファイルまたは設定に以下のような設定を追加することで、MCP サーバーとして利用できます：

例）ClaudeDesktop で AivisSpeech での設定例

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

## 環境変数

- `VOICEVOX_URL`: VOICEVOX エンジンの URL（デフォルト: `http://localhost:50021`）
- `VOICEVOX_DEFAULT_SPEAKER`: デフォルト話者 ID（例: `1`）
- `VOICEVOX_DEFAULT_SPEED_SCALE`: デフォルト再生速度（例: `1.0`）

## ブラウザ互換性

- **Chrome, Firefox, Edge**: 完全対応
- **Safari**: ファイルダウンロードに特殊対応あり

## ライセンス

ISC
