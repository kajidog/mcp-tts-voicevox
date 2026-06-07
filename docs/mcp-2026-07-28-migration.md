# MCP 2026-07-28 対応 追加調査メモ

このファイルは、別途共有された「MCP仕様 2026-07-28 対応 作業指示書」を
実コードに照らして追加調査した結果をまとめたもの。
元の指示書で挙がっていない／具体化が必要な対応項目を補足する。

調査時点の依存: `@modelcontextprotocol/sdk@1.26.0`（= 2025-11-25 仕様）,
`@modelcontextprotocol/ext-apps@1.0.1`。SDK が 2026-07-28 対応版を出すまでは
コード変更は時期尚早（現行クライアントを壊すため）。本メモは「リリース後に何を直すか」の精緻化。

---

## 元指示書の前提補足（リポジトリ構成のズレ）

- 指示書は `packages/mcp-core/`・`apps/mcp-tts/` 構成を前提にしており、これは現状と一致する。
- ただしルートの `CLAUDE.md` は旧構成（`src/` 単独 + `packages/voicevox-client/`）のまま。
  2026-07-28 対応とは別件だが、ドキュメント整合のため `CLAUDE.md` の更新も推奨。

---

## 【優先度: 高／追加】CORS 許可ヘッダーに新ルーティングヘッダーを追加

対象: `packages/mcp-core/src/http.ts`（`allowHeaders`, L259-267）

◇ 何が問題か
- 2026-07-28 では本体検査なしのルーティングのため `Mcp-Method` / `Mcp-Name` ヘッダーが
  新たに必須化される（SEP-2575 関連）。サーバーはヘッダーと本文の不一致を拒否する。
- 現状の CORS `allowHeaders` は `mcp-session-id` / `mcp-protocol-version` 等は含むが、
  `Mcp-Method` / `Mcp-Name` を含まない。ブラウザ系クライアントのプリフライトで弾かれる恐れ。

◇ どうするか
- [ ] `allowHeaders` から `mcp-session-id` を削除し、`Mcp-Method` / `Mcp-Name` を追加する。
- [ ] `exposeHeaders` の `mcp-session-id` も撤去する。
- [ ] SDK 確定版が要求するヘッダー名の最終形に追従する（命名・大文字小文字含む）。

---

## 【優先度: 高／追加】`extra.sessionId` 全廃の波及（話者ヘッダー配送経路）

対象:
- `apps/mcp-tts/src/index.ts`（L145-156, `onSessionInitialized` で `X-Voicevox-Speaker` を読む）
- `packages/mcp-core/src/session.ts`（sessionId キーの設定ストア）
- `apps/mcp-tts/src/tools/utils.ts`（`getEffectiveSpeaker`, L25-29 → `getSessionConfig(sessionId)`）
- `apps/mcp-tts/src/tools/types.ts`（`ToolHandlerExtra.sessionId`）
- 利用箇所: `tools/speak.ts` L100 / `tools/synthesize.ts` L46 /
  `tools/player/speak-player-tool.ts` L58 / `tools/player/resynthesize-player-tool.ts` L82

◇ 何が問題か
- 指示書は「X-Voicevox-Speaker を毎リクエストで読む方式に変更」とあるが、**配送手段**が課題。
  現状は「初期化フックで sessionId をキーに `setSessionConfig` →
  ツールハンドラで `extra.sessionId` を使い `getSessionConfig` で引く」二段構え。
- ステートレス化で `extra.sessionId` が `undefined` になるため、
  `getEffectiveSpeaker` のセッション分岐（明示パラメータ > **セッション設定** > グローバル）が
  常にグローバルへフォールバックし、プロジェクト別デフォルト話者が機能しなくなる。

◇ どうするか
- [ ] セッションストア（`session.ts`）方式を廃止し、リクエストヘッダーを
      ツールハンドラまで直接届ける方式に変更する。SDK 2026-07-28 版が
      ツールコールバックの `extra` に `requestInfo`（HTTP ヘッダー）を渡すか、
      `_meta` 経由で受け取れるかを確認し、それを `getEffectiveSpeaker` の入力にする。
- [ ] `ToolHandlerExtra` の `sessionId` を、ヘッダー由来の話者を運ぶ形（例: `defaultSpeaker?` や
      `requestHeaders?`）へ置き換える。
- [ ] `getSessionConfig` / `setSessionConfig` / `deleteSessionConfig`（`session.ts`）の要否を再判定。
      ステートレスでは保持不要のため、モジュールごと削除できる可能性が高い。

---

## 【優先度: 高／追加】HTTP トランスポートのステートレス化（具体手順）

対象: `packages/mcp-core/src/http.ts`（`handleMCP`, L172-241）

◇ 現状
- `transports: Map` でセッションIDごとに transport を保持。
- `isInitializeRequest(body)` 判定で初回のみ transport 生成、`sessionIdGenerator: () => randomUUID()`。
- `onsessioninitialized` / `transport.onclose` で `transports` と `deleteSessionConfig` /
  `onSessionClosed` を出し入れ。

◇ どうするか（SDK 確定版の API に合わせて最終調整）
- [ ] `sessionIdGenerator` を `undefined`（SDK のステートレスモード）に切替、または
      リクエストごとに transport+server を生成して 1 リクエスト自己完結にする。
- [ ] `isInitializeRequest` 分岐・`transports` Map・`onsessioninitialized` /
      `onclose` / `deleteSessionConfig` / `onSessionClosed` を撤去（実装は単純化方向）。
- [ ] `import { isInitializeRequest }`・`import { deleteSessionConfig }`・`randomUUID` の不要 import を削除。
- [ ] `badRequestError()` のデフォルト文言「No valid session ID provided」を見直し
      （セッション概念が無くなるため）。
- [ ] `handleHealth`（L246-253）の `transports: transports.size` はステートレスで無意味化。
      指標を削除するか別の値（uptime 等）に変更。
- [ ] `CreateHttpAppOptions` から `serverFactory` / `onSessionInitialized` /
      `onSessionClosed` の要否を再設計（`launcher.ts` L34-41 の `LaunchOptions` も連動）。

備考: 既存エラーコードは `-32000`/`-32001`/`-32603` の標準域で、独自 `-32002` の
ハードコードは全リポジトリに無い（指示書【低】は確認済み・対応不要）。

---

## 【優先度: 中／追加】テストの更新

ステートレス化で以下のテストが前提崩壊するため要修正:
- [ ] `apps/mcp-tts/src/tools/player/__tests__/session-state.test.ts`
      （「viewUUID なしで sessionId にフォールバック」L96 など）
- [ ] `apps/mcp-tts/src/tools/player-ui/__tests__/context.test.ts`
      （`saveStateForViewAndSession` が sessionId にも保存する前提 L35, L47）
- [ ] HTTP セッション往復を検証しているテスト一式（`mcp-core` 側）

---

## 【優先度: 中／任意】キャッシュメタデータ（SEP-2549）への追従

対象: `apps/mcp-tts/src/tools/player/get-player-state-tool.ts`,
`apps/mcp-tts/src/tools/player/audio-cache.ts`,
`packages/player-ui/src/hooks/playerToolClient.ts`（`fetchPlayerStateOnServer` の独自ページング）

◇ 内容
- list/resource 応答に `ttlMs` / `cacheScope`（HTTP Cache-Control 相当）が追加される。
- 本プロジェクトは独自の音声キャッシュ + `cursor`/`limit`/`hasMore`/`nextCursor` ページングを
  既に持つ。SSE 常時接続なしのクライアント側キャッシュを、標準フィールドで表現できる余地あり。
- [ ] 任意対応。少なくとも `get_player_state` / リソース応答での採用可否を検討。

---

## 【優先度: 低／任意】出力スキーマ・構造化出力（SEP-2106）

対象: ツール全般（`createSuccessResponse` が JSON を `text` content で返す: `tools/utils.ts` L18-20）

◇ 内容
- 出力スキーマが無制限化し、`structuredContent` が任意 JSON を受け付ける。
- 現状は「JSON.stringify した文字列を text content で返し、UI 側で再 parse」している
  （`playerToolClient.ts` の `getTextPayload` → `JSON.parse` が多数）。
- [ ] 任意対応。`registerTool` の `outputSchema` + `structuredContent` 採用で、
      `player-ui` 側の二重シリアライズ/パースを簡素化できる。後方互換に留意。

---

## 【対応不要／確認済（追加分）】

- **Tasks API 再設計（実験的→拡張化）**: `tasks/*`・`registerTask` の利用なし → 影響なし。
- **Elicitation / Sampling / createMessage**: 利用箇所なし → 影響なし。
- **マルチラウンドトリップ（SEP-2322, InputRequiredResult）**: 現状サーバー起点プロンプト未使用 → 影響なし。
- **認可ハードニング（OAuth/OIDC, iss 検証等）**: 本サーバーは独自 `X-API-Key` / `Bearer`
  認証（`http.ts` `validateApiKey`）であり OAuth フローを持たない → 強化対象外。将来 OAuth 採用時に再検討。
- **分散トレーシング（SEP-414, `_meta` の traceparent 等）**: 任意。現状未使用 → 影響なし。
- **拡張フレームワーク（SEP-2133, reverse-DNS / capabilities マップ）**: ext-apps 側で吸収される想定。
  指示書【中】の ext-apps 追従に含めて対応。

---

## 対応順序（推奨）

1. SDK 2026-07-28 対応版 + ext-apps 更新版のリリースを待つ（前提）。
2. `http.ts` のステートレス化 + CORS ヘッダー更新（高）。
3. `session.ts` 廃止と話者ヘッダーの per-request 配送（`getEffectiveSpeaker` 経路）（高）。
4. `session-state.ts` の sessionId フォールバック整理（指示書【中】）+ 関連テスト修正（中）。
5. ext-apps 追従と UI 双方向通信の動作確認（指示書【中】）。
6. キャッシュメタ／構造化出力は任意で後追い（中・低）。
</content>
</invoke>
