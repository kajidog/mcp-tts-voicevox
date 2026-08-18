# @kajidog/voicevox-client

## 0.7.1

### Patch Changes

- e826ef7: Fix the `exports` map so the `types` condition comes first, as TypeScript
  requires — resolution previously fell back to the top-level `types` field.

  The HTTP server's API key check now compares in constant time instead of with
  `!==`, which leaked key material through response timing. The published server
  bundle also targets Node 20, matching its `engines` field.

- 5f7e207: Windows 再生時の PowerShell コマンドインジェクションを修正し、API リクエストのタイムアウトを設定可能にしました。

  - セキュリティ修正: ファイルパスに `'` が含まれると PowerShell 文字列を脱出して任意コマンドが実行できる問題を修正。パスを base64 で渡し PowerShell 側でデコードする方式に変更（併せてパスを歪めていた不要なバックスラッシュ二重化を廃止）。
  - `VoicevoxConfig` に `timeoutMs`（デフォルト 30000）を追加。長文合成や低速エンジンでのタイムアウトを調整できます。
