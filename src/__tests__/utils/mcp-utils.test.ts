import {
  createErrorResponse,
  createSuccessResponse,
  parseAudioQuery,
  parseStringInput,
} from "../../utils/mcp-utils";

describe("MCP Utils", () => {
  describe("createErrorResponse", () => {
    it("Errorオブジェクトからエラーレスポンスを作成する", () => {
      const error = new Error("テストエラー");
      const response = createErrorResponse(error);

      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toContain("エラー: テストエラー");
    });

    it("コンテキスト付きでエラーレスポンスを作成する", () => {
      const error = new Error("テストエラー");
      const context = "speakツールの実行中";
      const response = createErrorResponse(error, context);

      expect(response.content[0].text).toContain("エラー: テストエラー");
      expect(response.content[0].text).toContain("詳細: " + context);
    });

    it("未知のエラータイプを処理する", () => {
      const error = "文字列エラー";
      const response = createErrorResponse(error);

      expect(response.content[0].text).toContain("エラー: 文字列エラー");
    });
  });

  describe("createSuccessResponse", () => {
    it("成功レスポンスを作成する", () => {
      const message = "操作が成功しました";
      const response = createSuccessResponse(message);

      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toBe(message);
    });

    it("空文字列でも成功レスポンスを作成する", () => {
      const response = createSuccessResponse("");

      expect(response.content[0].text).toBe("");
    });
  });

  describe("parseAudioQuery", () => {
    it("JSON文字列のクエリを解析する", () => {
      const queryJson = JSON.stringify({
        accent_phrases: [],
        speedScale: 1.0,
        pitchScale: 0.0,
        intonationScale: 1.0,
        volumeScale: 1.0,
      });

      const result = parseAudioQuery(queryJson);

      expect(result).toMatchObject({
        accent_phrases: [],
        speedScale: 1.0,
        pitchScale: 0.0,
        intonationScale: 1.0,
        volumeScale: 1.0,
      });
    });

    it("speedScaleを上書きする", () => {
      const queryJson = JSON.stringify({
        accent_phrases: [],
        speedScale: 1.0,
      });

      const result = parseAudioQuery(queryJson, 1.5);

      expect(result.speedScale).toBe(1.5);
    });

    it("speedScaleが未指定の場合は元の値を保持", () => {
      const queryJson = JSON.stringify({
        accent_phrases: [],
        speedScale: 2.0,
      });

      const result = parseAudioQuery(queryJson);

      expect(result.speedScale).toBe(2.0);
    });

    it("不正なJSONの場合はエラーを投げる", () => {
      const invalidJson = "invalid json";

      expect(() => parseAudioQuery(invalidJson)).toThrow();
    });
  });

  describe("parseStringInput", () => {
    it("単一テキストを解析する", () => {
      const input = "こんにちは";
      const result = parseStringInput(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: "こんにちは",
        speaker: undefined,
      });
    });

    it("改行区切りの複数テキストを解析する", () => {
      const input = "こんにちは\\n今日はいい天気ですね";
      const result = parseStringInput(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        text: "こんにちは",
        speaker: undefined,
      });
      expect(result[1]).toEqual({
        text: "今日はいい天気ですね",
        speaker: undefined,
      });
    });

    it("speaker指定付きテキストを解析する", () => {
      const input = "1:こんにちは\\n2:今日はいい天気ですね";
      const result = parseStringInput(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        text: "こんにちは",
        speaker: 1,
      });
      expect(result[1]).toEqual({
        text: "今日はいい天気ですね",
        speaker: 2,
      });
    });

    it("新しいengine-id形式のspeaker指定を解析する", () => {
      const input = "main-1:こんにちは\\naivis-888753764:今日はいい天気ですね";
      const result = parseStringInput(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        text: "こんにちは",
        speaker: "main-1",
      });
      expect(result[1]).toEqual({
        text: "今日はいい天気ですね",
        speaker: "aivis-888753764",
      });
    });

    it("混在形式（speaker指定あり・なし）を解析する", () => {
      const input = "普通のテキスト\\n1:speaker指定テキスト\\n再び普通のテキスト";
      const result = parseStringInput(input);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        text: "普通のテキスト",
        speaker: undefined,
      });
      expect(result[1]).toEqual({
        text: "speaker指定テキスト",
        speaker: 1,
      });
      expect(result[2]).toEqual({
        text: "再び普通のテキスト",
        speaker: undefined,
      });
    });

    it("空の行を無視する", () => {
      const input = "こんにちは\\n\\n今日はいい天気ですね\\n";
      const result = parseStringInput(input);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("こんにちは");
      expect(result[1].text).toBe("今日はいい天気ですね");
    });

    it("コロンを含むテキスト（speaker指定ではない）を正しく処理する", () => {
      const input = "時間は12:30です";
      const result = parseStringInput(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: "時間は12:30です",
        speaker: undefined,
      });
    });

    it("複雑なspeaker名を含むコロン区切りを処理する", () => {
      const input = "complex-engine-123:複雑な名前のエンジンです";
      const result = parseStringInput(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: "複雑な名前のエンジンです",
        speaker: "complex-engine-123",
      });
    });
  });
});