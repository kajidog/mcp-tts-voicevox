# @kajidog/mcp-tts-voicevox

## 0.9.0

### Minor Changes

- a46b957: Require Node.js 24 or newer for both published packages. The server bundle, Docker images, CI, and development instructions now use Node 24, and the test suite uses Vitest 5. Browser support for voicevox-client is unchanged.
- 5f7e207: HTTP モードで `voicevox_stop_speaker` が再生を止められない不具合を修正しました。
  ステートレス HTTP ではリクエストごとに `McpServer` を作るため、`speak` を実行した
  再生キューと `stop_speaker` が触る再生キューが別インスタンスになっていました。
  `VoicevoxClient` をプロセス内で共有するようにして、どのリクエストからでも
  同じ再生キューを停止できるようにしています（stdio モードの挙動は変わりません）。
  
  書き込み先ディレクトリを制限する `--allowed-output-dirs` /
  `VOICEVOX_ALLOWED_OUTPUT_DIRS`（カンマ区切り）を追加しました。設定すると
  `voicevox_synthesize_file` の `output` とプレイヤーのトラック書き出しの `outputDir` が
  許可ディレクトリ配下に限定され、外へのパスは対処方法つきのエラーで拒否されます。
  未設定時は従来どおり制限なしです。
  
  あわせて、プレイヤーのトラック書き出しはデコード結果が RIFF/WAVE ヘッダを持つ
  WAV であることを検証するようになり、WAV 以外のデータは書き出さずに失敗します。
  
  VOICEVOX API リクエストのタイムアウトを `--timeout-ms` / `VOICEVOX_TIMEOUT_MS`
  （デフォルト 30000）で変更できるようにしました。長文合成や低速なエンジンで
  30 秒を超えて失敗していたケースに対応できます。

### Patch Changes

- 4edb9c3: ドキュメントを実装に合わせて更新しました（コードの変更はありません）。
  
  - README（英/日）: `voicevox_speak` の `phrases`（インラインアクセント表記）と `waitForStart` を追記し、辞書ツール一覧とインラインアクセント表記の説明を追加
  - README（英/日）: プレイヤーツール名を実際の `voicevox_` 付きの名前に修正、パッケージ構成に `@kajidog/mcp-core` を追加、ルートに存在しない `pnpm dev` 系コマンドを `pnpm --filter` 形式に修正
  - `packages/voicevox-client/README.md`: `VoicevoxConfig` の全項目、`speak()` / `enqueueAudioGeneration()` の戻り値（`SpeakResult`）、ユーザー辞書 API とアクセント表記ユーティリティを追記。ライブラリが読まない環境変数の記載とライセンス表記（ISC）を修正
  - `examples/README.md`: npm 前提の手順を pnpm に修正し、ファイル再生サンプルを追記
- 3950c39: Update the bundled `@kajidog/mcp-core` runtime dependencies (hono 4.13.2, @hono/node-server 2.1.1).
- 24b6c8f: Update the MCP SDK to 1.30.1, which bounds HTTP request bodies and JSON-RPC batch lengths and fixes OAuth resource URI handling. Keep MCP Apps on 1.x until the server is migrated to the SDK 2 APIs.
- 57836ba: Fix `phrases` (inline accent notation) rejecting valid input with "Bracket position N does not align with any mora boundary".
  
  VOICEVOX runs its own morphological analysis on the katakana text, so the accent phrases it returns do not always line up with the phrase separators (`,`) in the notation — `アクセントシ` comes back split as `アクセント` + `シ`, for instance. Accent phrases were matched to notation phrases by index, so the bracket position was looked up inside the wrong accent phrase and a correct notation could fail depending on the words used.
  
  Accent phrases are now regrouped to follow the notation's phrase boundaries before the accent is applied: a notation phrase spanning several accent phrases is merged into one, and an accent phrase spanning several notation phrases is split. If the notation cannot be matched against the moras (non-katakana text, for example), the previous index-based behaviour is used as a fallback.
  
  Omitting the brackets now restores VOICEVOX's own accent phrase segmentation as well as its accent values, so an accent set with brackets can be reset afterwards. Flat accents (`accent: 0`) are also kept as-is when a phrase is split.
- e826ef7: Fix the `exports` map so the `types` condition comes first, as TypeScript
  requires — resolution previously fell back to the top-level `types` field.
  
  The HTTP server's API key check now compares in constant time instead of with
  `!==`, which leaked key material through response timing. The published server
  bundle also targets Node 20, matching its `engines` field.
- Updated dependencies [4edb9c3]
- Updated dependencies [a46b957]
- Updated dependencies [57836ba]
- Updated dependencies [e826ef7]
- Updated dependencies [5f7e207]
  - @kajidog/voicevox-client@0.8.0
