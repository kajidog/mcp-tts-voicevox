# VOICEVOX Client Examples

voicevox-clientパッケージの動作確認用サンプルスクリプト集です。

## 前提条件

- Node.js 18以上
- VOICEVOXエンジンが起動していること（デフォルト: http://localhost:50021）

## セットアップ

```bash
cd examples
npm install
```

## スクリプト一覧

### 基本テスト (basic.ts)

シンプルなテキスト読み上げの動作確認。

```bash
npm run basic
```

確認内容:
- テキストから音声への変換
- 話者の指定
- 速度の変更

### キューテスト (queue.ts)

複数テキストの連続再生とキュー動作の確認。

```bash
npm run queue
```

確認内容:
- 複数テキストの順次再生
- immediate オプション（割り込み再生）
- 長短テキストの混在処理

### プリフェッチテスト (prefetch.ts)

音声生成の先読み（プリフェッチ）機能の確認。

```bash
npm run prefetch
```

確認内容:
- プリフェッチによる再生間隔の短縮
- 一括追加時の並列生成
- 待ち時間の測定

### ファイル生成テスト (file-generation.ts)

WAVファイル生成機能の確認。

```bash
npm run file
```

確認内容:
- テキストからファイル生成
- クエリ経由でのファイル生成
- 話者/速度の変更

## 環境変数

```bash
# VOICEVOXエンジンのURL
VOICEVOX_URL=http://localhost:50021

# デフォルト話者ID
VOICEVOX_DEFAULT_SPEAKER=1

# デフォルト速度
VOICEVOX_DEFAULT_SPEED_SCALE=1.0
```
