# VOICEVOX MCP サンプルコード

このディレクトリには、VOICEVOX MCPサーバーの使用例が含まれています。

## サンプル一覧

### test-voicevox.ts
VOICEVOXクライアントとMCPツールの包括的なテストスクリプトです。

以下の機能をテストします：
- テキストから音声への変換と再生
- 音声ファイルの生成
- 再生速度の変更
- 音声生成キュー
- MCPツール（speak、generate_query、synthesize_file）

## 実行方法

1. VOICEVOXエンジンを起動
```bash
# VOICEVOXをダウンロードして起動
# https://voicevox.hiroshiba.jp/
```

2. 依存関係のインストール
```bash
cd examples
npm install
```

3. サンプルの実行
```bash
npx ts-node test-voicevox.ts
```

## 環境変数

- `VOICEVOX_URL`: VOICEVOXエンジンのURL（デフォルト: http://localhost:50021）
- `VOICEVOX_DEFAULT_SPEAKER`: デフォルトの話者ID（デフォルト: 1）
- `VOICEVOX_DEFAULT_SPEED_SCALE`: デフォルトの再生速度（デフォルト: 1.0）
- `TEST_SLOW_SPEED`: 遅い速度のテストを実行するかどうか（デフォルト: false）