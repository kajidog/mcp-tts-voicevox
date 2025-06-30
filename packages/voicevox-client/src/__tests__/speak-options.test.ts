import { VoicevoxClient } from "../client";
import { VoicevoxConfig, PlaybackOptions } from "../types";

// APIのモック
jest.mock("../api", () => ({
  VoicevoxApi: jest.fn().mockImplementation(() => ({
    generateQuery: jest.fn().mockResolvedValue({
      accent_phrases: [],
      speedScale: 1.0,
      pitchScale: 0.0,
      intonationScale: 1.0,
      volumeScale: 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      outputSamplingRate: 24000,
      outputStereo: false,
    }),
    synthesize: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
  })),
}));

// プレイヤーのモック
const mockEnqueueQueryWithOptions = jest.fn();
jest.mock("../player", () => ({
  VoicevoxPlayer: jest.fn().mockImplementation(() => ({
    getQueueManager: jest.fn().mockReturnValue({
      enqueueQueryWithOptions: mockEnqueueQueryWithOptions,
    }),
    clearQueue: jest.fn(),
  })),
}));

describe("VoicevoxClient - speak メソッドのオプションテスト", () => {
  const originalEnv = process.env;
  let client: VoicevoxClient;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    const config: VoicevoxConfig = {
      url: "http://localhost:50021",
      defaultSpeaker: 1,
    };

    client = new VoicevoxClient(config);

    // enqueueQueryWithOptions のモックを設定
    mockEnqueueQueryWithOptions.mockResolvedValue({
      item: { id: "test" },
      promises: {},
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("immediate オプションの動作確認", () => {
    it("immediate=true を指定した場合、第1セグメントに immediate=true が渡される", async () => {
      const options: PlaybackOptions = { immediate: true };

      await client.speak("テスト音声", 1, 1.0, options);

      expect(mockEnqueueQueryWithOptions).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: true })
      );
    });

    it("immediate=false を指定した場合、第1セグメントに immediate=false が渡される", async () => {
      const options: PlaybackOptions = { immediate: false };

      await client.speak("テスト音声", 1, 1.0, options);

      expect(mockEnqueueQueryWithOptions).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: false })
      );
    });

    it("複数セグメントの場合、第2セグメント以降は immediate=false になる", async () => {
      const options: PlaybackOptions = { immediate: true };

      // VoicevoxClientには話者番号付きではなく、SpeechSegment配列として渡す
      const segments = [
        { text: "第1セグメント", speaker: 1 },
        { text: "第2セグメント", speaker: 2 },
      ];

      await client.speak(segments, 1, 1.0, options);

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 第1セグメント
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ immediate: true })
      );

      // 第2セグメント（immediate=false になる）
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ immediate: false })
      );
    });
  });

  describe("waitForEnd オプションの動作確認", () => {
    it("waitForEnd=true の場合、すべてのセグメントの Promise が作成される", async () => {
      const options: PlaybackOptions = { waitForEnd: true };

      // Promise を作成するモック
      mockEnqueueQueryWithOptions.mockResolvedValue({
        item: { id: "test" },
        promises: {
          end: Promise.resolve(),
        },
      });

      const segments = [
        { text: "第1セグメント", speaker: 1 },
        { text: "第2セグメント", speaker: 2 },
      ];

      await client.speak(segments, 1, 1.0, options);

      // 第1セグメント
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForEnd: true })
      );

      // 第2セグメント
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: true })
      );
    });

    it("waitForEnd=false の場合、第2セグメント以降は非同期処理される", async () => {
      const options: PlaybackOptions = { waitForEnd: false };

      mockEnqueueQueryWithOptions.mockResolvedValue({
        item: { id: "test" },
        promises: {},
      });

      const segments = [
        { text: "第1セグメント", speaker: 1 },
        { text: "第2セグメント", speaker: 2 },
      ];

      await client.speak(segments, 1, 1.0, options);

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 第1セグメント
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({ waitForEnd: false })
      );

      // 第2セグメント（非同期なので実行順序は保証されない）
      expect(mockEnqueueQueryWithOptions).toHaveBeenCalledWith(
        expect.any(Object),
        2,
        expect.objectContaining({ waitForEnd: false, immediate: false })
      );
    });
  });

  describe("waitForStart オプションの動作確認", () => {
    it("waitForStart=true の場合、すべてのセグメントに適用される", async () => {
      const options: PlaybackOptions = { waitForStart: true };

      mockEnqueueQueryWithOptions.mockResolvedValue({
        item: { id: "test" },
        promises: {
          start: Promise.resolve(),
        },
      });

      const segments = [
        { text: "第1セグメント", speaker: 1 },
        { text: "第2セグメント", speaker: 2 },
      ];

      await client.speak(segments, 1, 1.0, options);

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockEnqueueQueryWithOptions).toHaveBeenCalledWith(
        expect.any(Object),
        1,
        expect.objectContaining({ waitForStart: true })
      );

      expect(mockEnqueueQueryWithOptions).toHaveBeenCalledWith(
        expect.any(Object),
        2,
        expect.objectContaining({ waitForStart: true })
      );
    });
  });

  describe("複合オプションのテスト", () => {
    it("immediate=true, waitForStart=true, waitForEnd=true の組み合わせ", async () => {
      const options: PlaybackOptions = {
        immediate: true,
        waitForStart: true,
        waitForEnd: true,
      };

      mockEnqueueQueryWithOptions.mockResolvedValue({
        item: { id: "test" },
        promises: {
          start: Promise.resolve(),
          end: Promise.resolve(),
        },
      });

      const segments = [
        { text: "第1セグメント", speaker: 1 },
        { text: "第2セグメント", speaker: 2 },
      ];

      await client.speak(segments, 1, 1.0, options);

      // 第1セグメント
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        1,
        expect.objectContaining({
          immediate: true,
          waitForStart: true,
          waitForEnd: true,
        })
      );

      // 第2セグメント（immediate は false になる）
      expect(mockEnqueueQueryWithOptions).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        2,
        expect.objectContaining({
          immediate: false,
          waitForStart: true,
          waitForEnd: true,
        })
      );
    });
  });

  describe("エラー処理の確認", () => {
    it("第2セグメント以降でエラーが発生しても第1セグメントは影響を受けない", async () => {
      // console.errorをモックして抑制
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      const options: PlaybackOptions = { waitForEnd: false };

      // 第1セグメントは成功、第2セグメントでエラー
      mockEnqueueQueryWithOptions
        .mockResolvedValueOnce({
          item: { id: "test1" },
          promises: {},
        })
        .mockRejectedValueOnce(new Error("第2セグメントエラー"));

      const segments = [
        { text: "第1セグメント", speaker: 1 },
        { text: "第2セグメント", speaker: 2 },
      ];

      // エラーが発生してもメソッド全体は成功する（非同期処理のため）
      await expect(
        client.speak(segments, 1, 1.0, options)
      ).resolves.toBeDefined();

      // 非同期処理なので少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockEnqueueQueryWithOptions).toHaveBeenCalledTimes(2);
      
      // console.errorを元に戻す
      console.error = originalConsoleError;
    });
  });
});