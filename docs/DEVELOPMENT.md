# 開発ガイド

## 開発環境のセットアップ

### 必要条件
- Node.js 18.0.0 以上
- pnpm または npm
- Git

### リポジトリのクローン
```bash
git clone https://github.com/kajidog/mcp-tts-voicevox.git
cd mcp-tts-voicevox
```

### 依存関係のインストール
```bash
# pnpm を使用（推奨）
pnpm install

# または npm
npm install
```

## プロジェクト構造

```
mcp-tts-voicevox/
├── src/                    # MCP サーバー
│   ├── index.ts           # エントリーポイント
│   ├── server.ts          # MCP サーバー実装
│   ├── stdio.ts           # Stdio トランスポート
│   └── http.ts            # HTTP トランスポート
├── packages/
│   └── voicevox-client/   # VOICEVOX クライアント
│       ├── src/
│       │   ├── client.ts  # メインクライアント
│       │   ├── api.ts     # VOICEVOX API
│       │   ├── effect/    # Effect.ts 統合
│       │   ├── queue/     # キュー管理
│       │   └── player.ts  # 音声再生
│       └── package.json
├── docs/                  # ドキュメント
├── package.json           # ルートパッケージ
└── CLAUDE.md             # 開発指針
```

## 開発コマンド

### ルートレベル
```bash
# 全パッケージのビルド
pnpm build

# 全パッケージのテスト実行
pnpm test

# 全パッケージのリント
pnpm lint

# リントエラーの自動修正
pnpm lint:fix

# 開発モードで起動（Stdio）
pnpm dev

# 開発モードで起動（HTTP）
pnpm dev:http
```

### voicevox-client パッケージ
```bash
cd packages/voicevox-client

# ビルド
pnpm build

# テスト
pnpm test

# リント
pnpm lint
```

## 開発フロー

### 1. ブランチ戦略
```bash
# 機能開発
git checkout -b feature/new-feature

# バグ修正
git checkout -b fix/bug-description

# ドキュメント更新
git checkout -b docs/update-readme
```

### 2. 開発サイクル
1. **実装**
   ```bash
   # VOICEVOX エンジンを起動
   ./voicevox_engine
   
   # 開発サーバー起動
   pnpm dev
   ```

2. **テスト**
   ```bash
   # 単体テスト
   pnpm test
   
   # 手動テスト（別ターミナル）
   echo '{"text": "テストです"}' | pnpm start
   ```

3. **リント**
   ```bash
   pnpm lint:fix
   ```

4. **コミット**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

## テスト

### テストの種類
- **単体テスト**: 個別モジュールのテスト
- **統合テスト**: MCP サーバー全体のテスト
- **E2E テスト**: VOICEVOX エンジンとの連携テスト

### テスト実行
```bash
# 全テスト実行
pnpm test

# ウォッチモード
pnpm test --watch

# カバレッジ
pnpm test --coverage
```

### テストファイルの場所
```
src/__tests__/             # MCP サーバーのテスト
packages/voicevox-client/src/__tests__/  # クライアントのテスト
```

### モックの使用
```typescript
// VOICEVOX API のモック
vi.mock('../api', () => ({
  synthesize: vi.fn().mockResolvedValue(mockAudioData),
  getSpeakers: vi.fn().mockResolvedValue(mockSpeakers)
}))

// 音声再生のモック
vi.mock('../player', () => ({
  play: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined)
}))
```

## デバッグ

### ログの有効化
```bash
# デバッグログを有効化
DEBUG=mcp-tts-voicevox:* pnpm dev

# Effect.ts のログを有効化
EFFECT_LOG_LEVEL=debug pnpm dev
```

### VS Code でのデバッグ
`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "env": {
        "NODE_ENV": "development"
      },
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

## コーディング規約

### TypeScript
- 型注釈を明示的に記述
- `any` の使用を避ける
- Effect.ts のパターンに従う

### ネーミング
- 変数・関数: camelCase
- クラス・型: PascalCase
- 定数: UPPER_SNAKE_CASE
- ファイル: kebab-case

### ファイル構成
```typescript
// 順序: imports → types → constants → functions → default export
import { Effect } from 'effect'
import type { VoicevoxClient } from './types'

export type SpeakParams = {
  readonly text: string
  readonly speaker?: number
}

const DEFAULT_SPEAKER = 1

export const speak = (params: SpeakParams): Effect.Effect<void, SpeakError> => {
  // implementation
}

export default VoicevoxClient
```

## Effect.ts パターン

### サービス定義
```typescript
// Service の定義
export interface ApiService {
  readonly synthesize: (params: SynthesizeParams) => Effect.Effect<AudioData, ApiError>
}

// Service タグ
export class ApiService extends Context.Tag("ApiService")<
  ApiService,
  ApiService
>() {}

// Live 実装
export const ApiServiceLive = Layer.succeed(
  ApiService,
  ApiService.of({
    synthesize: (params) => Effect.gen(function* () {
      // implementation
    })
  })
)
```

### エラーハンドリング
```typescript
// エラー型の定義
export class VoicevoxError extends Data.TaggedError("VoicevoxError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// エラーの使用
const speakEffect = Effect.gen(function* () {
  const result = yield* apiCall.pipe(
    Effect.catchAll((error) =>
      new VoicevoxError({ message: 'API call failed', cause: error })
    )
  )
  return result
})
```

## 新機能の追加

### MCP ツールの追加
1. **型定義** (`src/types.ts`)
   ```typescript
   export type NewToolParams = {
     readonly param1: string
     readonly param2?: number
   }
   ```

2. **バリデーションスキーマ** (`src/schemas.ts`)
   ```typescript
   export const newToolSchema = z.object({
     param1: z.string(),
     param2: z.number().optional()
   })
   ```

3. **ツール定義** (`src/server.ts`)
   ```typescript
   const newTool: MCPTool = {
     name: 'new_tool',
     description: 'New tool description',
     inputSchema: zodToJsonSchema(newToolSchema)
   }
   ```

4. **ハンドラー実装** (`src/server.ts`)
   ```typescript
   case 'new_tool':
     const params = newToolSchema.parse(arguments)
     const result = await handleNewTool(params)
     return { content: [{ type: 'text', text: result }] }
   ```

5. **テスト** (`src/__tests__/new-tool.test.ts`)
   ```typescript
   describe('new_tool', () => {
     it('should work correctly', async () => {
       // テスト実装
     })
   })
   ```

### VOICEVOX クライアントの機能拡張
1. **Effect Service の追加**
2. **API エンドポイントの追加**
3. **型定義の更新**
4. **テストの追加**

## パフォーマンス最適化

### メモリ使用量の監視
```typescript
// メモリ使用量のログ
const logMemoryUsage = () => {
  const usage = process.memoryUsage()
  console.log('Memory usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB'
  })
}
```

### 音声キューの最適化
- キューサイズの制限
- 古い音声データの自動削除
- プリフェッチの制御

## リリース準備

### バージョン更新
```bash
# パッケージバージョンの更新
pnpm version patch   # patch version
pnpm version minor   # minor version  
pnpm version major   # major version
```

### ビルドの確認
```bash
# 本番ビルド
pnpm build

# ビルド成果物の確認
ls -la dist/
```

### リリースノートの作成
1. CHANGELOG.md の更新
2. 新機能・修正内容のまとめ
3. Breaking Changes の明記

## トラブルシューティング

### よくある問題

**1. TypeScript コンパイルエラー**
```bash
# 型チェックのみ実行
pnpm tsc --noEmit

# 依存関係の再インストール
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**2. Effect.ts の型エラー**
```typescript
// Effect.gen を使用する際の型推論
const effect = Effect.gen(function* () {
  // yield* を使用して Effect を展開
  const result = yield* someEffect
  return result
})
```

**3. テストが失敗する**
```bash
# テストの詳細実行
pnpm test --verbose

# 単一テストファイルの実行
pnpm test src/__tests__/specific.test.ts
```

**4. VOICEVOX エンジンとの接続エラー**
```bash
# エンジンの状態確認
curl http://localhost:50021/version

# ポートの確認
lsof -i :50021
```

## 貢献ガイドライン

### プルリクエスト
1. **ブランチ命名**: `feature/`, `fix/`, `docs/` プレフィックス
2. **コミットメッセージ**: Conventional Commits 形式
3. **テスト**: 新機能には必ずテストを追加
4. **ドキュメント**: API 変更時はドキュメントも更新

### コードレビュー
- 型安全性の確認
- Effect.ts パターンの準拠
- パフォーマンスへの影響
- テストカバレッジ

### Issue 報告
- 再現手順の明記
- 環境情報の記載
- エラーログの添付