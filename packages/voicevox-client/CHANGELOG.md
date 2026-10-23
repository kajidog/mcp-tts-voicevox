# @kajidog/voicevox-client

## 0.8.0

### Minor Changes

- a46b957: Require Node.js 24 or newer for both published packages. The server bundle, Docker images, CI, and development instructions now use Node 24, and the test suite uses Vitest 5. Browser support for voicevox-client is unchanged.

### Patch Changes

- 4edb9c3: ドキュメントを実装に合わせて更新しました（コードの変更はありません）。
  
  - README（英/日）: `voicevox_speak` の `phrases`（インラインアクセント表記）と `waitForStart` を追記し、辞書ツール一覧とインラインアクセント表記の説明を追加
  - README（英/日）: プレイヤーツール名を実際の `voicevox_` 付きの名前に修正、パッケージ構成に `@kajidog/mcp-core` を追加、ルートに存在しない `pnpm dev` 系コマンドを `pnpm --filter` 形式に修正
  - `packages/voicevox-client/README.md`: `VoicevoxConfig` の全項目、`speak()` / `enqueueAudioGeneration()` の戻り値（`SpeakResult`）、ユーザー辞書 API とアクセント表記ユーティリティを追記。ライブラリが読まない環境変数の記載とライセンス表記（ISC）を修正
  - `examples/README.md`: npm 前提の手順を pnpm に修正し、ファイル再生サンプルを追記
- 57836ba: Fix `phrases` (inline accent notation) rejecting valid input with "Bracket position N does not align with any mora boundary".
  
  VOICEVOX runs its own morphological analysis on the katakana text, so the accent phrases it returns do not always line up with the phrase separators (`,`) in the notation — `アクセントシ` comes back split as `アクセント` + `シ`, for instance. Accent phrases were matched to notation phrases by index, so the bracket position was looked up inside the wrong accent phrase and a correct notation could fail depending on the words used.
  
  Accent phrases are now regrouped to follow the notation's phrase boundaries before the accent is applied: a notation phrase spanning several accent phrases is merged into one, and an accent phrase spanning several notation phrases is split. If the notation cannot be matched against the moras (non-katakana text, for example), the previous index-based behaviour is used as a fallback.
  
  Omitting the brackets now restores VOICEVOX's own accent phrase segmentation as well as its accent values, so an accent set with brackets can be reset afterwards. Flat accents (`accent: 0`) are also kept as-is when a phrase is split.
- e826ef7: Fix the `exports` map so the `types` condition comes first, as TypeScript
  requires — resolution previously fell back to the top-level `types` field.
  
  The HTTP server's API key check now compares in constant time instead of with
  `!==`, which leaked key material through response timing. The published server
  bundle also targets Node 20, matching its `engines` field.
- 5f7e207: Windows 再生時の PowerShell コマンドインジェクションを修正し、APIリクエストのタイムアウトを設定可能にしました。
  
  - セキュリティ修正: ファイルパスに `'` が含まれると PowerShell 文字列を脱出して任意コマンドが実行できる問題を修正。パスを base64 で渡し PowerShell 側でデコードする方式に変更（併せてパスを歪めていた不要なバックスラッシュ二重化を廃止）。
  - `VoicevoxConfig` に `timeoutMs`（デフォルト 30000）を追加。長文合成や低速エンジンでのタイムアウトを調整できます。
