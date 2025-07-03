import { VoiceEngineManager } from "@kajidog/voice-engine-manager";
import { VoicevoxClient } from "@kajidog/voicevox-client";
import {
  parseSpeaker,
  getEngineClient,
  getDefaultSpeaker,
} from "../../utils/speaker-utils";

// Mock dependencies
jest.mock("@kajidog/voice-engine-manager");
jest.mock("@kajidog/voicevox-client");

const MockedVoiceEngineManager = VoiceEngineManager as jest.MockedClass<typeof VoiceEngineManager>;
const MockedVoicevoxClient = VoicevoxClient as jest.MockedClass<typeof VoicevoxClient>;

describe("Speaker Utils", () => {
  let mockEngineManager: jest.Mocked<VoiceEngineManager>;
  let mockClientCache: Map<string, VoicevoxClient>;

  beforeEach(() => {
    mockEngineManager = new MockedVoiceEngineManager([]) as jest.Mocked<VoiceEngineManager>;
    mockClientCache = new Map();
    jest.clearAllMocks();
  });

  describe("parseSpeaker", () => {
    it("数値IDをデフォルトエンジンで解析する", () => {
      const result = parseSpeaker(1, "main", mockEngineManager);

      expect(result).toEqual({
        engineName: "main",
        speakerId: 1,
      });
    });

    it("engine-id形式の文字列を解析する", () => {
      const result = parseSpeaker("aivis-888753764", "main", mockEngineManager);

      expect(result).toEqual({
        engineName: "aivis",
        speakerId: 888753764,
      });
    });

    it("複雑なengine名を含む形式を解析する", () => {
      const result = parseSpeaker("custom-engine-2-speaker-123", "main", mockEngineManager);

      expect(result).toEqual({
        engineName: "custom-engine-2-speaker",
        speakerId: 123,
      });
    });

    it("数値文字列をデフォルトエンジンで解析する", () => {
      const result = parseSpeaker("42", "main", mockEngineManager);

      expect(result).toEqual({
        engineName: "main",
        speakerId: 42,
      });
    });

    it("不正な形式の場合はエラーを投げる", () => {
      expect(() => parseSpeaker("invalid-format", "main", mockEngineManager)).toThrow();
    });

    it("ハイフンがないengine名の場合はエラーを投げる", () => {
      expect(() => parseSpeaker("enginewithouthyphen", "main", mockEngineManager)).toThrow();
    });
  });

  describe("getEngineClient", () => {
    beforeEach(() => {
      mockEngineManager.getConfig.mockReturnValue([
        {
          name: "main",
          type: "voicevox" as const,
          url: "http://localhost:50021",
          priority: 1,
        },
      ]);
    });

    it("新しいクライアントを作成してキャッシュする", async () => {
      const mockClient = new MockedVoicevoxClient({ url: "http://localhost:50021", defaultSpeaker: 1 });
      MockedVoicevoxClient.mockImplementation(() => mockClient);

      const result = await getEngineClient("main", mockEngineManager, mockClientCache);

      expect(result).toBe(mockClient);
      expect(mockClientCache.get("main")).toBe(mockClient);
      expect(MockedVoicevoxClient).toHaveBeenCalledWith({ url: "http://localhost:50021", defaultSpeaker: 1 });
    });

    it("キャッシュされたクライアントを返す", async () => {
      const cachedClient = new MockedVoicevoxClient({ url: "http://localhost:50021", defaultSpeaker: 1 });
      mockClientCache.set("main", cachedClient);

      const result = await getEngineClient("main", mockEngineManager, mockClientCache);

      expect(result).toBe(cachedClient);
      expect(MockedVoicevoxClient).not.toHaveBeenCalled();
    });

    it("存在しないエンジンの場合はエラーを投げる", async () => {
      mockEngineManager.getConfig.mockReturnValue([]);

      await expect(getEngineClient("nonexistent", mockEngineManager, mockClientCache))
        .rejects.toThrow("エンジン 'nonexistent' が見つかりません");
    });
  });

  describe("getDefaultSpeaker", () => {
    it("エンジン設定からデフォルトspeakerを取得する", () => {
      mockEngineManager.getConfig.mockReturnValue([
        {
          name: "main",
          type: "voicevox" as const,
          url: "http://localhost:50021",
          priority: 1,
          default_speaker: 5,
        },
      ]);

      const result = getDefaultSpeaker("main", mockEngineManager);

      expect(result).toEqual({
        engineName: "main",
        speakerId: 5,
      });
    });

    it("デフォルトspeakerが未設定の場合は1を使用", () => {
      mockEngineManager.getConfig.mockReturnValue([
        {
          name: "main",
          type: "voicevox" as const,
          url: "http://localhost:50021",
          priority: 1,
        },
      ]);

      const result = getDefaultSpeaker("main", mockEngineManager);

      expect(result).toEqual({
        engineName: "main",
        speakerId: 1,
      });
    });

    it("存在しないエンジンの場合はエラーを投げる", () => {
      mockEngineManager.getConfig.mockReturnValue([]);

      expect(() => getDefaultSpeaker("nonexistent", mockEngineManager))
        .toThrow("エンジン 'nonexistent' が見つかりません");
    });

    it("AivisSpeechエンジンのデフォルトspeaker", () => {
      mockEngineManager.getConfig.mockReturnValue([
        {
          name: "aivis",
          type: "aivisspeech" as const,
          url: "http://localhost:10101",
          priority: 1,
          default_speaker: 888753764,
        },
      ]);

      const result = getDefaultSpeaker("aivis", mockEngineManager);

      expect(result).toEqual({
        engineName: "aivis",
        speakerId: 888753764,
      });
    });
  });
});