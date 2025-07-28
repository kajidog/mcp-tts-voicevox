# API リファレンス

## MCP ツール一覧

### speak
テキストを音声に変換して再生します。

**パラメータ:**
- `text` (必須): string - 読み上げるテキスト
- `speaker` (オプション): number - 話者ID（デフォルト: 環境変数または1）
- `speedScale` (オプション): number - 再生速度（デフォルト: 1.0）
- `immediate` (オプション): boolean - 即座に再生開始するか（デフォルト: true）
- `waitForStart` (オプション): boolean - 再生開始まで待機するか（デフォルト: false）
- `waitForEnd` (オプション): boolean - 再生終了まで待機するか（デフォルト: false）

**テキスト形式:**
```javascript
// 単一テキスト
{ "text": "こんにちは" }

// 改行区切りで複数テキスト
{ "text": "こんにちは\n今日はいい天気ですね" }

// 話者指定（行頭に "話者ID:" を付ける）
{ "text": "1:こんにちは\n3:今日はいい天気ですね" }
```

**再生制御の例:**
```javascript
// 基本的な使用
{ "text": "こんにちは世界" }

// 話者と速度を指定
{ 
  "text": "ゆっくり話します", 
  "speaker": 2, 
  "speedScale": 0.8 
}

// 即時優先再生（キューを迂回）
{ 
  "text": "緊急メッセージ", 
  "immediate": true, 
  "waitForEnd": true 
}

// 同期処理（再生完了まで待機）
{ 
  "text": "この音声が終わるまで次の処理を待機", 
  "waitForEnd": true 
}

// キューに追加するが自動再生しない
{ 
  "text": "手動で再生開始", 
  "immediate": false 
}
```

**レスポンス:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "音声を再生しました"
    }
  ]
}
```

### synthesize_file
音声ファイルを生成します。

**パラメータ:**
- `text` (必須): string - 音声合成するテキスト
- `speaker` (オプション): number - 話者ID
- `speedScale` (オプション): number - 再生速度
- `filename` (オプション): string - 出力ファイル名

**例:**
```javascript
{
  "text": "ファイルに保存します",
  "speaker": 1,
  "filename": "output.wav"
}
```

**レスポンス:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "音声ファイルを生成しました: /path/to/output.wav"
    }
  ]
}
```

### stop_speaker
現在の音声再生を停止し、キューをクリアします。

**パラメータ:** なし

**例:**
```javascript
{}
```

**レスポンス:**
```json
{
  "content": [
    {
      "type": "text", 
      "text": "音声再生を停止し、キューをクリアしました"
    }
  ]
}
```

### get_speakers
利用可能な話者の一覧を取得します。

**パラメータ:** なし

**例:**
```javascript
{}
```

**レスポンス:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "利用可能な話者:\n0: 四国めたん (ノーマル)\n1: 四国めたん (あまあま)\n2: 四国めたん (ツンツン)\n..."
    }
  ]
}
```

### get_speaker_detail
指定した話者の詳細情報を取得します。

**パラメータ:**
- `speaker_id` (必須): number - 話者ID

**例:**
```javascript
{ "speaker_id": 1 }
```

**レスポンス:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "話者詳細:\nID: 1\n名前: 四国めたん (あまあま)\nスタイル: あまあま\n..."
    }
  ]
}
```

### generate_query
音声合成用のクエリを生成します（上級者向け）。

**パラメータ:**
- `text` (必須): string - 音声合成するテキスト
- `speaker` (オプション): number - 話者ID

**例:**
```javascript
{
  "text": "クエリを生成します",
  "speaker": 1
}
```

## 高度な再生制御

### immediate パラメータ
- `true`: キューを迂回して即座に再生開始
- `false`: キューに追加するが自動再生しない

### waitForStart パラメータ
- `true`: 再生が開始されるまで MCP の応答を待機
- `false`: 再生開始を待たずにすぐに応答

### waitForEnd パラメータ
- `true`: 再生が完了するまで MCP の応答を待機
- `false`: 再生完了を待たずにすぐに応答

### 再生制御の組み合わせ例

```javascript
// パターン1: 緊急メッセージ（即座に再生し、完了まで待機）
{
  "text": "緊急！確認してください",
  "immediate": true,
  "waitForEnd": true
}

// パターン2: バックグラウンド再生（キューに追加、非同期）
{
  "text": "バックグラウンドメッセージ",
  "immediate": false,
  "waitForStart": false,
  "waitForEnd": false
}

// パターン3: 順次再生（前の音声が終わってから次へ）
{
  "text": "順番に再生1",
  "waitForEnd": true
}
// 次の音声は上記が完了してから処理される

// パターン4: 手動制御用（キューに追加のみ）
{
  "text": "手動で開始する音声",
  "immediate": false
}
```

## エラーハンドリング

### よくあるエラー

**VOICEVOX エンジンが起動していない:**
```json
{
  "error": {
    "code": -1,
    "message": "VOICEVOX エンジンに接続できません"
  }
}
```

**無効な話者ID:**
```json
{
  "error": {
    "code": -2,
    "message": "話者ID 999 は存在しません"
  }
}
```

**テキストが空:**
```json
{
  "error": {
    "code": -3,
    "message": "テキストが指定されていません"
  }
}
```

## 環境変数によるデフォルト値の変更

### VOICEVOX_DEFAULT_SPEAKER
デフォルトの話者IDを変更:
```bash
export VOICEVOX_DEFAULT_SPEAKER=3
```

### VOICEVOX_DEFAULT_SPEED_SCALE
デフォルトの再生速度を変更:
```bash
export VOICEVOX_DEFAULT_SPEED_SCALE=1.2
```

### VOICEVOX_DEFAULT_IMMEDIATE
デフォルトの即時再生設定を変更:
```bash
export VOICEVOX_DEFAULT_IMMEDIATE=false
```

### VOICEVOX_DEFAULT_WAIT_FOR_END
デフォルトの完了待機設定を変更:
```bash
export VOICEVOX_DEFAULT_WAIT_FOR_END=true
```

## 話者ID一覧（参考）

**四国めたん:**
- 0: ノーマル
- 1: あまあま
- 2: ツンツン
- 3: セクシー

**ずんだもん:**
- 4: ノーマル
- 5: あまあま
- 6: ツンツン
- 7: セクシー

**春日部つむぎ:**
- 8: ノーマル

**雨晴はう:**
- 9: ノーマル

**波音リツ:**
- 10: ノーマル

**玄野武宏:**
- 11: ノーマル
- 12: 喜び
- 13: ツンギレ

**白上虎太郎:**
- 14: ふつう
- 15: わーい
- 16: びくびく

**青山龍星:**
- 17: ノーマル

**冥鳴ひまり:**
- 18: ノーマル

**九州そら:**
- 19: ノーマル
- 20: あまあま
- 21: ツンツン
- 22: セクシー
- 23: ささやき

**もち子さん:**
- 24: ノーマル

**剣崎雌雄:**
- 25: ノーマル

**WhiteCUL:**
- 26: ノーマル
- 27: たのしい
- 28: かなしい
- 29: びくびく

**後鬼:**
- 30: 人間ver.
- 31: ぬいぐるみver.

**No.7:**
- 32: ノーマル
- 33: アナウンス
- 34: 読み聞かせ

**ちび式じい:**
- 35: ノーマル

**櫻歌ミコ:**
- 36: ノーマル
- 37: 第二形態
- 38: ロリ

**小夜/SAYO:**
- 39: ノーマル

**ナースロボ＿タイプＴ:**
- 40: ノーマル
- 41: 楽々
- 42: 恐怖
- 43: 内緒話

※話者IDは VOICEVOX エンジンのバージョンにより異なる場合があります。`get_speakers` ツールで最新の一覧を確認してください。