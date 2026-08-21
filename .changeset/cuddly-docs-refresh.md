---
"@kajidog/mcp-tts-voicevox": patch
"@kajidog/voicevox-client": patch
---

ドキュメントを実装に合わせて更新しました（コードの変更はありません）。

- README（英/日）: `voicevox_speak` の `phrases`（インラインアクセント表記）と `waitForStart` を追記し、辞書ツール一覧とインラインアクセント表記の説明を追加
- README（英/日）: プレイヤーツール名を実際の `voicevox_` 付きの名前に修正、パッケージ構成に `@kajidog/mcp-core` を追加、ルートに存在しない `pnpm dev` 系コマンドを `pnpm --filter` 形式に修正
- `packages/voicevox-client/README.md`: `VoicevoxConfig` の全項目、`speak()` / `enqueueAudioGeneration()` の戻り値（`SpeakResult`）、ユーザー辞書 API とアクセント表記ユーティリティを追記。ライブラリが読まない環境変数の記載とライセンス表記（ISC）を修正
- `examples/README.md`: npm 前提の手順を pnpm に修正し、ファイル再生サンプルを追記
