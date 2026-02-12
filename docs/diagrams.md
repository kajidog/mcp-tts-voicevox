# MCP TTS Voicevox の図解

このドキュメントでは、MCP TTS Voicevox の動作シーケンスとクラス構造を図で示します。

## ツール仕様サマリ

| ツール名 | 主パラメータ | 型 | 備考 |
|----------|--------------|----|------|
| `speak` | `text` | string | 改行区切り・話者プレフィックス対応 |
|  | `speaker?` `speedScale?` | number | 省略時はデフォルト |
|  | `immediate?` `waitForStart?` `waitForEnd?` | boolean | 再生制御オプション |
| `generate_query` | `text` | string | |
| `synthesize_file` | `text?`／`query?` | string / AudioQuery | `query` 優先 |
|  | `output` | string | 未指定なら一時ファイル|
| `stop_speaker` | – | – | |
| `get_speakers` | – | – | |

## シーケンス図

### `speak` 呼び出し

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as McpServer
    participant VClient as VoicevoxClient
    participant QueueSvc as QueueService
    participant AudioGen as AudioGenerator
    participant VApi as VoicevoxApi
    participant Engine as VOICEVOX Engine
    participant PlaybackSvc as PlaybackService
    participant FileMgr as AudioFileManager

    %% ① API 受信
    Client->>Server: invoke("speak", { text: "…", speaker?, options? })
    Server->>VClient: speak(text, options)

    %% ② VClient でテキスト分割＆最初のセグメント処理
    Note over VClient: テキストを分割・正規化
    VClient->>VApi: generateQuery(text, speaker)
    VApi->>Engine: POST /audio_query
    Engine-->>VApi: AudioQuery
    VApi-->>VClient: AudioQuery
    VClient->>QueueSvc: enqueueQuery(query, speaker, options)
    QueueSvc-->>VClient: { item, promises }
    VClient-->>Server: 成功応答
    Server-->>Client: { "音声生成キューに追加しました" }

    %% === 以下は非同期タスク ===
    Note over QueueSvc,PlaybackSvc: 非同期キュー処理
    QueueSvc->>AudioGen: generateAudioFromQuery(item)
    AudioGen->>VApi: synthesize(query)
    VApi->>Engine: POST /synthesis
    Engine-->>VApi: WAV
    VApi-->>AudioGen: Audio Data

    alt ストリーミング再生可能 (ffplay)
        AudioGen->>PlaybackSvc: playFromBuffer(audioData)
        PlaybackSvc->>System: ffplay (stdin)
    else ファイル再生
        AudioGen->>FileMgr: saveTempAudioFile()
        FileMgr-->>AudioGen: tempFilePath
        AudioGen->>PlaybackSvc: playFromFile(tempFile)
        PlaybackSvc->>System: afplay/paplay/PowerShell
    end
```

### `generate_query` 呼び出し

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as McpServer
    participant VClient as VoicevoxClient
    participant VApi as VoicevoxApi
    participant Engine as VOICEVOX Engine

    Client->>Server: invoke("generate_query", { text: "...", speaker: 1 })
    Server->>VClient: generateQuery("...", 1)
    VClient->>VApi: generateQuery("...", 1)
    VApi->>Engine: POST /audio_query
    Engine-->>VApi: AudioQuery JSON
    VApi-->>VClient: AudioQuery
    VClient-->>Server: AudioQuery (JSON String)
    Server-->>Client: { content: [{ type: "text", text: "AudioQuery JSON" }] }
```

### `synthesize_file` 呼び出し

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as McpServer
    participant VClient as VoicevoxClient
    participant VApi as VoicevoxApi
    participant Engine as VOICEVOX Engine
    participant FileMgr as AudioFileManager

    Client->>Server: invoke("synthesize_file", { text | query, output?, speaker? })
    Server->>VClient: generateAudioFile(text|query, output?, speaker?)
    alt output 未指定
        VClient->>VApi: synthesize(query)
        VApi->>Engine: POST /synthesis
        Engine-->>VApi: WAV
        VApi-->>VClient: Audio Data
        VClient->>FileMgr: saveTempAudioFile(audioData)
    else output 指定
        VClient->>VApi: synthesize(query)
        VApi-->>VClient: Audio Data
        VClient->>FileMgr: saveAudioFile(audioData, output)
    end
    FileMgr-->>VClient: filePath
    VClient-->>Server: filePath
    Server-->>Client: { filePath }
```

## アーキテクチャ概要

### モジュール構成

```
packages/voicevox-client/src/
├── client.ts              # VoicevoxClient（メインファサード）
├── api.ts                 # VoicevoxApi（VOICEVOX Engine通信）
├── types.ts               # 型定義
├── error.ts               # エラーハンドリング
├── utils.ts               # ユーティリティ
│
├── state/                 # 状態管理
│   ├── item-state-machine.ts   # アイテム状態遷移
│   └── types.ts
│
├── playback/              # 再生機能
│   ├── playback-service.ts     # 統一再生サービス
│   ├── playback-strategy.ts    # プラットフォーム別戦略
│   └── types.ts
│
└── queue/                 # キュー管理
    ├── queue-service.ts        # キュー操作
    ├── audio-generator.ts      # 音声生成
    ├── file-manager.ts         # ファイル管理
    ├── event-manager.ts        # イベント管理
    └── types.ts
```

### 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> PENDING: enqueue
    PENDING --> GENERATING: startGeneration
    GENERATING --> READY: generationComplete
    GENERATING --> ERROR: generationFailed
    READY --> PLAYING: startPlayback
    PLAYING --> DONE: playbackComplete
    PLAYING --> ERROR: playbackFailed
    DONE --> [*]
    ERROR --> [*]
```

## クラス図

主要なクラスとその関連を示します。

```mermaid
classDiagram
    class McpServer {
        +name: string
        +version: string
        +description: string
        +constructor(options)
        +tool(name, description, schema, handler)
        +connect(transport)
    }

    class VoicevoxClient {
        -queueService: QueueService
        -api: VoicevoxApi
        -defaultSpeaker: number
        -defaultSpeedScale: number
        -defaultPlaybackOptions: PlaybackOptions
        +constructor(config)
        +speak(input, options?) Promise~string~
        +generateQuery(text, speaker?, speedScale?) Promise~AudioQuery~
        +generateAudioFile(textOrQuery, outputPath?, speaker?, speedScale?) Promise~string~
        +enqueueAudioGeneration(input, options?) Promise~string~
        +getSpeakers() Promise~Speaker[]~
        +getSpeakerInfo(uuid) Promise~SpeakerInfo~
        +clearQueue() Promise~void~
        +startPlayback() void
        +pausePlayback() void
        +resumePlayback() void
        -normalizeInput(input, defaultSpeaker?) SpeechSegment[]
        -getSpeakerId(speaker?) number
        -getSpeedScale(speedScale?) number
    }

    class SpeakOptions {
        <<interface>>
        speaker?: number
        speedScale?: number
        immediate?: boolean
        waitForStart?: boolean
        waitForEnd?: boolean
    }

    class VoicevoxApi {
        -baseUrl: string
        +constructor(baseUrl)
        +generateQuery(text, speaker) Promise~AudioQuery~
        +synthesize(query, speaker) Promise~ArrayBuffer~
        +getSpeakers() Promise~Speaker[]~
        +getSpeakerInfo(uuid) Promise~SpeakerInfo~
        -makeRequest~T~(method, endpoint, data?, params?) Promise~T~
        -normalizeUrl(url) string
    }

    class QueueService {
        -queue: QueueItem[]
        -isPlaying: boolean
        -isPaused: boolean
        -api: VoicevoxApi
        -fileManager: AudioFileManager
        -eventManager: EventManager
        -audioGenerator: AudioGenerator
        -playbackService: PlaybackService
        +constructor(api)
        +enqueueQuery(query, speaker, options?) Promise~EnqueueResult~
        +enqueueText(text, speaker, options?) Promise~EnqueueResult~
        +clearQueue() Promise~void~
        +startPlayback() void
        +pausePlayback() void
        +resumePlayback() void
        +addEventListener(event, listener) void
        +removeEventListener(event, listener) void
        +getQueue() QueueItem[]
        +getFileManager() AudioFileManager
        -processQueue() Promise~void~
        -prefetchAudio() Promise~void~
    }

    class PlaybackService {
        -strategy: PlaybackStrategy
        -activePlaybacks: Map~string, AbortController~
        +constructor()
        +play(itemId, audio) Promise~void~
        +stop(itemId) void
        +stopAll() void
        +supportsStreaming() boolean
    }

    class PlaybackStrategy {
        <<interface>>
        +supportsStreaming() boolean
        +playFromBuffer(data, signal?) Promise~void~
        +playFromFile(filePath, signal?) Promise~void~
        +stop() void
    }

    class NodePlaybackStrategy {
        -ffplayAvailable: boolean
        -currentProcess: ChildProcess
        -linuxPlayer: string
        +supportsStreaming() boolean
        +playFromBuffer(data, signal?) Promise~void~
        +playFromFile(filePath, signal?) Promise~void~
        +stop() void
        -checkFfplayAvailable() boolean
        -getLinuxPlayer() string
    }

    class BrowserPlaybackStrategy {
        -audioElement: HTMLAudioElement
        +supportsStreaming() boolean
        +playFromBuffer(data, signal?) Promise~void~
        +playFromFile(blobUrl, signal?) Promise~void~
        +stop() void
    }

    class AudioGenerator {
        -api: VoicevoxApi
        -fileManager: AudioFileManager
        +constructor(api, fileManager)
        +generateQuery(text, speaker) Promise~AudioQuery~
        +generateAudio(item, updateStatus) Promise~void~
        +generateAudioFromQuery(item, updateStatus) Promise~void~
    }

    class AudioFileManager {
        +createTempFilePath() string
        +deleteTempFile(filePath) Promise~void~
        +saveTempAudioFile(audioData) Promise~string~
        +saveAudioFile(audioData, output) Promise~string~
    }

    class EventManager {
        -eventListeners: Map~QueueEventType, QueueEventListener[]~
        +constructor()
        +addEventListener(event, listener) void
        +removeEventListener(event, listener) void
        +emitEvent(event, item?) void
    }

    class ItemStateMachine {
        -state: QueueItemStatus
        +constructor(initialState)
        +getState() QueueItemStatus
        +transition(action) boolean
        +canTransition(action) boolean
    }

    class QueueItem {
        id: string
        text: string
        speaker: number
        status: QueueItemStatus
        createdAt: Date
        audioData?: ArrayBuffer
        tempFile?: string
        query?: AudioQuery
        error?: Error
    }

    McpServer --> VoicevoxClient : uses
    VoicevoxClient --> QueueService : uses
    VoicevoxClient --> VoicevoxApi : uses
    VoicevoxClient ..> SpeakOptions : uses
    QueueService --> VoicevoxApi : uses
    QueueService --> AudioFileManager : uses
    QueueService --> EventManager : uses
    QueueService --> AudioGenerator : uses
    QueueService --> PlaybackService : uses
    QueueService --> QueueItem : manages
    QueueService --> ItemStateMachine : uses
    AudioGenerator --> VoicevoxApi : uses
    AudioGenerator --> AudioFileManager : uses
    PlaybackService --> PlaybackStrategy : uses
    PlaybackStrategy <|.. NodePlaybackStrategy : implements
    PlaybackStrategy <|.. BrowserPlaybackStrategy : implements
```

## 再生オプション

### PlaybackOptions インターフェース

```typescript
interface PlaybackOptions {
  /** 即座に再生開始（キューを迂回） */
  immediate?: boolean;
  /** 再生開始まで待機 */
  waitForStart?: boolean;
  /** 再生終了まで待機 */
  waitForEnd?: boolean;
}
```

### 再生モードの比較

| オプション | デフォルト | 説明 |
|-----------|----------|------|
| `immediate: true` | true | キューに追加後すぐに再生開始 |
| `immediate: false` | - | キューに追加のみ（手動再生） |
| `waitForStart: true` | false | 再生開始まで処理をブロック |
| `waitForEnd: true` | false | 再生終了まで処理をブロック |

### プラットフォーム別再生方法

| プラットフォーム | ストリーミング | ファイル再生 |
|-----------------|--------------|-------------|
| macOS | ffplay (要インストール) | afplay (標準) |
| Windows | ffplay (要インストール) | PowerShell MediaPlayer (標準) |
| Linux | ffplay | aplay / paplay / play / ffplay |
| ブラウザ | 非対応 | HTMLAudioElement |
