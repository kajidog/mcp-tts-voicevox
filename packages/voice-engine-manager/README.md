# @kajidog/voice-engine-manager

複数の音声合成エンジン（VOICEVOX、AivisSpeech）を統一的に管理するためのライブラリです。

## 主な機能

- 複数の音声合成エンジンを統一インターフェースで管理
- エンジンの自動起動とヘルスチェック
- 優先度ベースのエンジン管理
- 実行時の設定変更
- ステータス監視とping機能

## インストール

```bash
npm install @kajidog/voice-engine-manager
```

## 基本的な使い方

### 従来の設定ベース初期化

```typescript
import { Manager } from '@kajidog/voice-engine-manager';

// エンジンの設定
const configs = [
  {
    name: 'main',
    type: 'voicevox',
    url: 'http://localhost:50021',
    boot_command: 'auto',
    priority: 10,
    default_speaker: 1
  },
  {
    name: 'sub',
    type: 'aivisspeech',
    url: 'http://localhost:10101',
    boot_command: 'deny',
    priority: 5,
    default_speaker: 888753764
  }
];

// マネージャーの作成
const manager = new Manager(configs);

// エンジンの起動
await manager.start(); // 全エンジン起動
await manager.start('main'); // 特定エンジンのみ起動

// ステータス確認
const statuses = await manager.ping();
console.log(statuses);

// エンジンの停止
await manager.stop('main'); // 特定エンジンの停止
await manager.stop(); // 全エンジンの停止
```

### 新しいDI方式（拡張性重視）

```typescript
import { VoiceEngineManager, VoicevoxEngine, AivisSpeechEngine } from '@kajidog/voice-engine-manager';

// エンジンインスタンスの作成
const voicevoxEngine = new VoicevoxEngine({
  name: 'voicevox-main',
  type: 'voicevox',
  priority: 1,
  boot_command: 'deny'
});

const aivisEngine = new AivisSpeechEngine({
  name: 'aivis-main',
  type: 'aivisspeech',
  priority: 2,
  boot_command: 'auto'
});

// マネージャーの作成
const manager = new VoiceEngineManager([voicevoxEngine, aivisEngine]);

// 動的なエンジン追加
const secondaryEngine = new VoicevoxEngine({
  name: 'voicevox-sub',
  type: 'voicevox'
});
manager.addEngine(secondaryEngine);

// エンジンの取得と操作
const engine = manager.getEngine('voicevox-main');
if (engine) {
  await engine.start();
  const status = await engine.ping();
  console.log(status);
}
```

## 設定項目

### EngineConfig

```typescript
interface EngineConfig {
  // 必須項目
  name: string;                     // 一意な識別子
  type: string;                     // エンジンタイプ（'voicevox', 'aivisspeech'など）
  
  // オプション項目
  url?: string;                     // エンジンのURL（省略時はデフォルト使用）
  boot_command?: string | "auto" | "deny"; // 起動制御
  default_speaker?: number | string; // デフォルトスピーカーID
  
  // 音声パラメータ
  speedScale?: number;              // 話速（0.5-2.0、デフォルト: 1.0）
  pitchScale?: number;              // 音高（-0.15-0.15、デフォルト: 0.0）
  intonationScale?: number;         // 抑揚（0.0-2.0、デフォルト: 1.0）
  volumeScale?: number;             // 音量（0.0-2.0、デフォルト: 1.0）
  
  // 再生オプション
  playbackOptions?: {
    immediate?: boolean;
    waitForStart?: boolean;
    waitForEnd?: boolean;
  };
  
  priority?: number;                // 優先度（高い値ほど高優先、デフォルト: 0）
  metadata?: Record<string, any>;   // カスタムメタデータ
}
```

### デフォルト値

- VOICEVOX URL: `http://localhost:50021`
- AivisSpeech URL: `http://localhost:10101`
- VOICEVOX デフォルトスピーカー: `1`
- AivisSpeech デフォルトスピーカー: `888753764`

## API リファレンス

### Manager / VoiceEngineManager

#### `getConfig(filter?: FilterOptions): EngineConfig[]`
エンジン設定を取得。フィルタ条件に一致する設定の配列を返します。

```typescript
// 全設定を取得
const all = manager.getConfig();

// 特定のエンジンを取得
const main = manager.getConfig({ name: 'main' });

// タイプで絞り込み
const voicevox = manager.getConfig({ type: 'voicevox' });
```

#### `updateConfig(name: string, config: Partial<EngineConfig>): void`
実行時にエンジン設定を更新。

```typescript
manager.updateConfig('main', {
  speedScale: 1.2,
  pitchScale: 0.1
});
```

#### `ping(filter?: FilterOptions): Promise<EngineStatus[]>`
エンジンのヘルスチェック。オンライン状態、レイテンシ、バージョン情報を返します。

```typescript
// 全エンジンをping
const all = await manager.ping();

// 特定のエンジンをping
const main = await manager.ping({ name: 'main' });
```

#### `list(): EngineInfo[]`
設定されている全エンジンの現在のステータスを一覧表示。

#### `fetchOnlineConfig(filter?: { type?: string | string[] }): Promise<EngineConfig[]>`
現在オンラインでアクセス可能なエンジンの設定を取得。

```typescript
// オンラインの全エンジンを取得
const online = await manager.fetchOnlineConfig();

// オンラインのVOICEVOXエンジンのみ
const onlineVoicevox = await manager.fetchOnlineConfig({ type: 'voicevox' });
```

### VoiceEngineManager 専用メソッド（DI方式）

#### `addEngine(engine: IEngine): void`
新しいエンジンを動的に追加。

#### `removeEngine(name: string): void`
エンジンを削除（停止済みのエンジンのみ）。

#### `getEngine(name: string): IEngine | undefined`
名前でエンジンインスタンスを取得。

## カスタムエンジンの作成

新しい音声合成エンジンを追加する場合：

```typescript
import { BaseEngine, IEngine, EngineConfig } from '@kajidog/voice-engine-manager';

export class CustomEngine extends BaseEngine {
  async start(): Promise<void> {
    // エンジン起動ロジック
  }
  
  async stop(): Promise<void> {
    // エンジン停止ロジック
  }
  
  async ping(): Promise<EngineStatus> {
    // ヘルスチェックロジック
  }
  
  getDefaultLaunchCommand(): string {
    return './custom-engine';
  }
  
  getHealthEndpoint(): string {
    return '/health';
  }
  
  getDefaultUrl(): string {
    return 'http://localhost:50030';
  }
  
  getDefaultSpeaker(): number | string {
    return 'default';
  }
}
```

## ライセンス

ISC