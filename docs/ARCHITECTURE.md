# アーキテクチャ

## 概要

MCP TTS VOICEVOX は2つの独立したパッケージで構成されています：

1. **@kajidog/mcp-tts-voicevox** - MCP サーバー実装
2. **@kajidog/voicevox-client** - VOICEVOX クライアントライブラリ

## パッケージ分離の理由

### 単一責任原則
- MCP サーバーは MCP プロトコルの実装のみに専念
- VOICEVOX クライアントは音声合成機能のみに専念

### 再利用性
- VOICEVOX クライアントは他のプロジェクトでも使用可能
- MCP サーバーはクライアントの実装詳細に依存しない

### 保守性
- 各パッケージを独立して開発・テスト・デプロイ可能
- 依存関係が明確

## MCP サーバー（@kajidog/mcp-tts-voicevox）

### 構成

```
src/
├── index.ts         # エントリーポイント
├── server.ts        # MCP サーバー実装
├── stdio.ts         # Stdio トランスポート
└── http.ts          # HTTP トランスポート
```

### 責任範囲
- MCP プロトコルの実装
- パラメータバリデーション（Zod）
- Claude Desktop/Code との通信
- HTTP/Stdio トランスポートの切り替え

### 技術スタック
- **TypeScript** - 型安全性
- **@modelcontextprotocol/sdk** - MCP プロトコル
- **Zod** - スキーマバリデーション
- **Hono** - HTTP サーバーフレームワーク

### MCP ツール実装

各 MCP ツールは以下の流れで処理されます：

1. **パラメータバリデーション**（Zod スキーマ）
2. **VOICEVOX クライアント呼び出し**
3. **レスポンス生成**

```typescript
// 例: speak tool の実装
const speakTool = {
  name: 'speak',
  description: 'テキストを音声に変換して再生',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      speaker: { type: 'number', optional: true },
      // ...
    }
  }
}

// ハンドラー
async function handleSpeak(params: SpeakParams) {
  // 1. バリデーション
  const validated = speakSchema.parse(params)
  
  // 2. クライアント呼び出し
  await voicevoxClient.speak(validated)
  
  // 3. レスポンス
  return { content: [{ type: 'text', text: '音声を再生しました' }] }
}
```

## VOICEVOX クライアント（@kajidog/voicevox-client）

### 構成

```
packages/voicevox-client/src/
├── client.ts        # メインクライアント
├── api.ts          # VOICEVOX API 通信
├── effect/         # Effect.ts 統合
│   ├── context.ts  # Effect Context
│   ├── errors.ts   # 構造化エラー
│   └── services/   # Effect Services
├── queue/          # 音声キュー管理
│   ├── queue-manager.ts
│   └── audio-player.ts
└── player.ts       # 音声再生制御
```

### 責任範囲
- VOICEVOX エンジンとの HTTP 通信
- 音声キュー管理
- クロスプラットフォーム音声再生
- Effect.ts による関数型エラーハンドリング

### 技術スタック
- **TypeScript** - 型安全性
- **Effect.ts** - 関数型エラーハンドリング
- **Axios** - HTTP クライアント
- **UUID** - ユニークID生成

## Effect.ts 統合

### なぜ Effect.ts か

1. **構造化エラーハンドリング**
   - エラーの種類を型で表現
   - エラーの合成と変換が容易

2. **関数型プログラミング**
   - 副作用の明示的な管理
   - パイプライン処理

3. **テスタビリティ**
   - 依存性の注入が容易
   - モックしやすい設計

### Effect サービス設計

```typescript
// API Service
interface ApiService {
  readonly synthesize: (params: SynthesizeParams) => Effect.Effect<AudioData, VoicevoxError>
  readonly getSpeakers: () => Effect.Effect<Speaker[], VoicevoxError>
}

// Audio Player Service  
interface AudioPlayerService {
  readonly play: (audioData: AudioData) => Effect.Effect<void, PlaybackError>
  readonly stop: () => Effect.Effect<void, never>
}

// Queue Manager Service
interface QueueManagerService {
  readonly enqueue: (item: QueueItem) => Effect.Effect<void, QueueError>
  readonly clear: () => Effect.Effect<void, never>
}
```

### エラーハンドリング

```typescript
// 構造化エラー型
export type VoicevoxError =
  | ApiError
  | NetworkError  
  | AudioError
  | ValidationError

export class ApiError extends Data.TaggedError("ApiError")<{
  readonly message: string
  readonly statusCode: number
}> {}

// エラーの合成
const speakEffect = (text: string) =>
  Effect.gen(function* () {
    const audioData = yield* apiService.synthesize({ text })
    const queueItem = yield* queueService.enqueue(audioData)  
    yield* playerService.play(queueItem)
  }).pipe(
    Effect.catchTags({
      ApiError: (error) => Effect.logError(`API Error: ${error.message}`),
      AudioError: (error) => Effect.logError(`Audio Error: ${error.message}`)
    })
  )
```

## 音声キュー管理

### キューの役割
- 複数の音声合成リクエストを順序管理
- 即時再生（キュー迂回）の制御
- プリフェッチによる待機時間短縮

### キューの状態管理

```typescript
type QueueState = {
  readonly items: ReadonlyArray<QueueItem>
  readonly currentPlaying: Option<QueueItem>
  readonly isPlaying: boolean
}

type QueueItem = {
  readonly id: string
  readonly text: string
  readonly audioData: Option<AudioData>
  readonly status: 'pending' | 'generating' | 'ready' | 'playing' | 'completed'
}
```

### 処理フロー

1. **エンキュー** - テキストをキューに追加
2. **音声生成** - バックグラウンドで音声合成
3. **再生開始** - 前の音声が終了したら自動再生
4. **プリフェッチ** - 次の音声を事前生成

## クロスプラットフォーム音声再生

### プラットフォーム別実装

**macOS:**
```bash
afplay audio.wav
```

**Windows:**
```powershell
Add-Type -AssemblyName presentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open([uri]$audioFile)
$mediaPlayer.Play()
```

**Linux:**
```bash
# 利用可能なツールを自動検出
aplay audio.wav      # ALSA
paplay audio.wav     # PulseAudio  
play audio.wav       # SoX
ffplay audio.wav     # FFmpeg
```

### 音声再生の抽象化

```typescript
interface AudioPlayer {
  readonly play: (audioPath: string) => Effect.Effect<void, AudioError>
  readonly stop: () => Effect.Effect<void, never>
  readonly isPlaying: () => Effect.Effect<boolean, never>
}

// プラットフォーム検出
const createAudioPlayer = (): AudioPlayer => {
  switch (process.platform) {
    case 'darwin': return new MacAudioPlayer()
    case 'win32': return new WindowsAudioPlayer()  
    case 'linux': return new LinuxAudioPlayer()
    default: throw new Error('Unsupported platform')
  }
}
```

## HTTP vs Stdio トランスポート

### Stdio モード
- Claude Desktop との標準的な連携方式
- プロセス間通信（stdin/stdout）
- シンプルで軽量

### HTTP モード  
- Claude Code や他のクライアントとの連携
- REST API + Server-Sent Events
- ネットワーク経由でアクセス可能

### トランスポート切り替え

```typescript
// 環境変数による切り替え
const transport = process.env.MCP_HTTP_MODE === 'true' 
  ? createHttpTransport()
  : createStdioTransport()

// サーバー起動
const server = new Server({ transport })
await server.start()
```

## 設定管理

### 環境変数

```typescript
const config = {
  voicevox: {
    url: process.env.VOICEVOX_URL ?? 'http://localhost:50021',
    defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER ?? '1'),
    defaultSpeedScale: Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE ?? '1.0')
  },
  playback: {
    defaultImmediate: process.env.VOICEVOX_DEFAULT_IMMEDIATE !== 'false',
    defaultWaitForEnd: process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === 'true'
  },
  server: {
    httpMode: process.env.MCP_HTTP_MODE === 'true',
    httpPort: Number(process.env.MCP_HTTP_PORT ?? '3000'),
    httpHost: process.env.MCP_HTTP_HOST ?? '0.0.0.0'
  }
}
```

## テスト戦略

### 単体テスト
- Effect Services の個別テスト
- モック依存性による分離テスト

### 統合テスト  
- MCP サーバー全体のテスト
- VOICEVOX エンジンとの連携テスト

### モック戦略
```typescript
// API Service のモック
const mockApiService = ApiService.of({
  synthesize: () => Effect.succeed(mockAudioData),
  getSpeakers: () => Effect.succeed(mockSpeakers)
})

// テスト実行
const testEffect = speakEffect("test").pipe(
  Effect.provide(ApiServiceLive.pipe(Layer.provide(mockApiService)))
)
```

## パフォーマンス考慮事項

### メモリ使用量
- 音声データのストリーミング処理
- キューサイズの制限

### レスポンス時間
- 音声合成の並列処理
- プリフェッチによる待機時間短縮

### ネットワーク効率
- VOICEVOX エンジンとの Keep-Alive 接続
- 不要なリクエストの削減

## 拡張性

### 新しいTTSエンジンの追加
- ApiService の実装を追加
- 設定による切り替え

### 新しい音声フォーマットの対応
- AudioPlayer の拡張
- フォーマット検出の自動化

### 新しいトランスポートの追加
- Transport インターフェースの実装
- プラグイン機構の活用