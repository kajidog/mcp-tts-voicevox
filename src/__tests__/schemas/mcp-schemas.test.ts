import { z } from "zod";
import {
  TextSegmentSchema,
  TextInputSchema,
  CommonParametersSchema,
  PlaybackOptionsSchema,
} from "../../schemas/mcp-schemas";

describe("MCP Schemas", () => {
  describe("TextSegmentSchema", () => {
    it("有効なテキストセグメントを受け入れる", () => {
      const validSegment = {
        text: "こんにちは",
        speaker: "main-1",
      };

      const result = TextSegmentSchema.parse(validSegment);
      expect(result).toEqual(validSegment);
    });

    it("数値のspeaker IDを受け入れる", () => {
      const validSegment = {
        text: "こんにちは",
        speaker: 1,
      };

      const result = TextSegmentSchema.parse(validSegment);
      expect(result).toEqual(validSegment);
    });

    it("speakerが未指定でも有効", () => {
      const validSegment = {
        text: "こんにちは",
      };

      const result = TextSegmentSchema.parse(validSegment);
      expect(result).toEqual(validSegment);
    });

    it("textが空文字列の場合エラー", () => {
      const invalidSegment = {
        text: "",
        speaker: "main-1",
      };

      expect(() => TextSegmentSchema.parse(invalidSegment)).toThrow();
    });
  });

  describe("TextInputSchema", () => {
    it("文字列入力を受け入れる", () => {
      const validInput = "こんにちは\\n今日はいい天気ですね";
      const result = TextInputSchema.parse(validInput);
      expect(result).toBe(validInput);
    });

    it("空文字列を受け入れる", () => {
      const validInput = "";
      const result = TextInputSchema.parse(validInput);
      expect(result).toBe(validInput);
    });

    it("数値入力はエラー", () => {
      expect(() => TextInputSchema.parse(123)).toThrow();
    });
  });

  describe("CommonParametersSchema", () => {
    it("文字列のspeaker IDを受け入れる", () => {
      const schema = z.object(CommonParametersSchema);
      const validParams = {
        speaker: "main-1",
        speedScale: 1.2,
      };

      const result = schema.parse(validParams);
      expect(result).toEqual(validParams);
    });

    it("数値のspeaker IDを受け入れる", () => {
      const schema = z.object(CommonParametersSchema);
      const validParams = {
        speaker: 1,
        speedScale: 1.2,
      };

      const result = schema.parse(validParams);
      expect(result).toEqual(validParams);
    });

    it("パラメータが未指定でも有効", () => {
      const schema = z.object(CommonParametersSchema);
      const validParams = {};

      const result = schema.parse(validParams);
      expect(result).toEqual(validParams);
    });

    it("speedScaleが負の値の場合でも受け入れる", () => {
      const schema = z.object(CommonParametersSchema);
      const validParams = {
        speedScale: -1.0,
      };

      const result = schema.parse(validParams);
      expect(result).toEqual(validParams);
    });
  });

  describe("PlaybackOptionsSchema", () => {
    it("全てのオプションを受け入れる", () => {
      const schema = z.object(PlaybackOptionsSchema);
      const validOptions = {
        immediate: true,
        waitForStart: false,
        waitForEnd: true,
      };

      const result = schema.parse(validOptions);
      expect(result).toEqual(validOptions);
    });

    it("オプションが未指定でも有効", () => {
      const schema = z.object(PlaybackOptionsSchema);
      const validOptions = {};

      const result = schema.parse(validOptions);
      expect(result).toEqual(validOptions);
    });

    it("部分的なオプション指定も有効", () => {
      const schema = z.object(PlaybackOptionsSchema);
      const validOptions = {
        immediate: false,
      };

      const result = schema.parse(validOptions);
      expect(result).toEqual(validOptions);
    });

    it("文字列のboolean値はエラー", () => {
      const schema = z.object(PlaybackOptionsSchema);
      const invalidOptions = {
        immediate: "true",
      };

      expect(() => schema.parse(invalidOptions)).toThrow();
    });
  });
});