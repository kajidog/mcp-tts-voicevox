---
"@kajidog/voicevox-client": patch
---

Windows 再生時の PowerShell コマンドインジェクションを修正し、APIリクエストのタイムアウトを設定可能にしました。

- セキュリティ修正: ファイルパスに `'` が含まれると PowerShell 文字列を脱出して任意コマンドが実行できる問題を修正。パスを base64 で渡し PowerShell 側でデコードする方式に変更（併せてパスを歪めていた不要なバックスラッシュ二重化を廃止）。
- `VoicevoxConfig` に `timeoutMs`（デフォルト 30000）を追加。長文合成や低速エンジンでのタイムアウトを調整できます。
