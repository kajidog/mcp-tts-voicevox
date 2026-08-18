---
"@kajidog/mcp-tts-voicevox": minor
---

HTTP モードで `voicevox_stop_speaker` が再生を止められない不具合を修正しました。
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
