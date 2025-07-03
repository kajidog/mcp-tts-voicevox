import { z } from "zod";
import { VoiceEngineManager } from "@kajidog/voice-engine-manager";
import { VoicevoxClient } from "@kajidog/voicevox-client";
import { speakToolSchema, speakToolHandler } from "../../tools/speak-tool";

// Mock dependencies
jest.mock("@kajidog/voice-engine-manager");
jest.mock("@kajidog/voicevox-client");

const MockedVoiceEngineManager = VoiceEngineManager as jest.MockedClass<typeof VoiceEngineManager>;
const MockedVoicevoxClient = VoicevoxClient as jest.MockedClass<typeof VoicevoxClient>;

describe("Speak Tool", () => {
  let mockEngineManager: jest.Mocked<VoiceEngineManager>;
  let mockClientCache: Map<string, VoicevoxClient>;
  let mockClient: jest.Mocked<VoicevoxClient>;
  
  // 環境変数のバックアップ
  const originalEnv = process.env;

  beforeEach(() => {
    // 環境変数をリセット
    process.env = { ...originalEnv };
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VOICEVOX_')) {
        delete process.env[key];
      }
    });

    mockEngineManager = new MockedVoiceEngineManager([]) as jest.Mocked<VoiceEngineManager>;
    mockClientCache = new Map();
    mockClient = new MockedVoicevoxClient({ url: "http://localhost:50021", defaultSpeaker: 1 }) as jest.Mocked<VoicevoxClient>;
    
    // デフォルトのモック設定
    mockEngineManager.getConfig.mockReturnValue([
      {
        name: "main",
        type: "voicevox" as const,
        url: "http://localhost:50021",
        priority: 1,
        default_speaker: 1,
      },
    ]);

    // getEngine メソッドのモック
    mockEngineManager.getEngine.mockReturnValue({
      name: "main",
      type: "voicevox",
      url: "http://localhost:50021",
      isHealthy: jest.fn().mockReturnValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({ status: "running" }),
    } as any);

    // list メソッドのモック
    mockEngineManager.list.mockReturnValue([
      {
        name: "main",
        type: "voicevox",
        url: "http://localhost:50021",
        isHealthy: jest.fn().mockReturnValue(true),
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({ status: "running" }),
      } as any,
    ]);

    mockClient.speak.mockResolvedValue("音声再生完了");
    mockClient.enqueueAudioGeneration.mockResolvedValue("音声生成完了");
    mockClientCache.set("main", mockClient);

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("speakToolSchema", () => {
    it("有効なパラメータを受け入れる", () => {
      const validParams = {
        text: "こんにちは",
        speaker: "main-1",
        speedScale: 1.2,
        immediate: true,
        waitForStart: false,
        waitForEnd: true,
        query: undefined,
      };

      const schema = z.object(speakToolSchema);
      const result = schema.parse(validParams);
      expect(result).toMatchObject(validParams);
    });

    it("必須パラメータのみでも有効", () => {
      const minimalParams = {
        text: "こんにちは",
      };

      const schema = z.object(speakToolSchema);
      const result = schema.parse(minimalParams);
      expect(result.text).toBe("こんにちは");
    });
  });

  describe("speakToolHandler", () => {
    const dependencies = {
      engineManager: mockEngineManager,
      clientCache: mockClientCache,
      defaultEngineName: "main",
    };

    it("基本的なテキスト音声合成を実行する", async () => {
      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
      };

      const result = await handler(params);

      expect(result.content[0].text).toBe("音声再生完了");
      expect(mockClient.speak).toHaveBeenCalledWith(
        "こんにちは",
        1, // デフォルトspeaker
        undefined, // speedScale
        expect.objectContaining({
          immediate: true, // デフォルト
          waitForStart: false, // デフォルト
          waitForEnd: false, // デフォルト
        })
      );
    });

    it("speaker指定で音声合成を実行する", async () => {
      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
        speaker: "main-3",
      };

      const result = await handler(params);

      expect(result.content[0].text).toBe("音声再生完了");
      expect(mockClient.speak).toHaveBeenCalledWith(
        "こんにちは",
        3, // 指定したspeaker
        undefined,
        expect.any(Object)
      );
    });

    it("数値speakerIDでも動作する", async () => {
      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
        speaker: 5,
      };

      const result = await handler(params);

      expect(mockClient.speak).toHaveBeenCalledWith(
        "こんにちは",
        5,
        undefined,
        expect.any(Object)
      );
    });

    it("speedScaleを指定して実行する", async () => {
      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
        speedScale: 1.5,
      };

      const result = await handler(params);

      expect(mockClient.speak).toHaveBeenCalledWith(
        "こんにちは",
        1,
        1.5, // 指定したspeedScale
        expect.any(Object)
      );
    });

    it("queryを指定した場合はenqueueAudioGenerationを使用する", async () => {
      const handler = speakToolHandler(dependencies);
      const audioQuery = JSON.stringify({
        accent_phrases: [],
        speedScale: 1.0,
        pitchScale: 0.0,
        intonationScale: 1.0,
        volumeScale: 1.0,
      });
      const params = {
        text: "こんにちは",
        query: audioQuery,
      };

      const result = await handler(params);

      expect(result.content[0].text).toBe("音声生成完了");
      expect(mockClient.enqueueAudioGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          accent_phrases: [],
          speedScale: 1.0,
        }),
        1, // デフォルトspeaker
        undefined, // speedScale
        expect.any(Object)
      );
    });

    it("環境変数でデフォルト再生オプションを設定できる", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "false";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "true";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = "true";

      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
      };

      const result = await handler(params);

      expect(mockClient.speak).toHaveBeenCalledWith(
        "こんにちは",
        1,
        undefined,
        expect.objectContaining({
          immediate: false, // 環境変数で設定
          waitForStart: true, // 環境変数で設定
          waitForEnd: true, // 環境変数で設定
        })
      );
    });

    it("明示的なオプション指定が環境変数より優先される", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "false";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "true";

      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
        immediate: true, // 明示指定
        waitForEnd: false, // 明示指定
      };

      const result = await handler(params);

      expect(mockClient.speak).toHaveBeenCalledWith(
        "こんにちは",
        1,
        undefined,
        expect.objectContaining({
          immediate: true, // 明示指定が優先
          waitForStart: true, // 環境変数
          waitForEnd: false, // 明示指定が優先
        })
      );
    });

    it("複数セグメントのテキストを処理する", async () => {
      const handler = speakToolHandler(dependencies);
      const params = {
        text: "1:こんにちは\\n2:今日はいい天気ですね",
      };

      const result = await handler(params);

      expect(mockClient.speak).toHaveBeenCalledTimes(2);
      expect(mockClient.speak).toHaveBeenNthCalledWith(
        1,
        "こんにちは",
        1, // speaker "1"
        undefined,
        expect.any(Object)
      );
      expect(mockClient.speak).toHaveBeenNthCalledWith(
        2,
        "今日はいい天気ですね",
        2, // speaker "2"
        undefined,
        expect.any(Object)
      );
    });

    it("エラーが発生した場合はエラーレスポンスを返す", async () => {
      mockClient.speak.mockRejectedValue(new Error("音声合成エラー"));

      const handler = speakToolHandler(dependencies);
      const params = {
        text: "こんにちは",
      };

      const result = await handler(params);

      expect(result.content[0].text).toContain("エラー: 音声合成エラー");
      expect(result.content[0].text).toContain("詳細: speakツールの実行中");
    });
  });
});