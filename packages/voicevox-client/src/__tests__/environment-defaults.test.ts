import { VoicevoxClient } from "../client";
import { VoicevoxConfig } from "../types";

// APIとプレイヤーのモック
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

jest.mock("../player", () => ({
  VoicevoxPlayer: jest.fn().mockImplementation(() => ({
    getQueueManager: jest.fn().mockReturnValue({
      enqueueQueryWithOptions: jest.fn().mockResolvedValue({
        item: { id: "test" },
        promises: {},
      }),
    }),
    clearQueue: jest.fn(),
  })),
}));

describe("VoicevoxClient - 環境変数デフォルト値テスト", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("環境変数からのデフォルト値設定", () => {
    it("VOICEVOX_DEFAULT_IMMEDIATE=true の場合、デフォルトで immediate が true になる", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "true";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      // プライベートプロパティにアクセスするためのキャスト
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(true);
    });

    it("VOICEVOX_DEFAULT_IMMEDIATE=false の場合、デフォルトで immediate が false になる", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "false";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(false);
    });

    it("VOICEVOX_DEFAULT_WAIT_FOR_START=true の場合、デフォルトで waitForStart が true になる", async () => {
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "true";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.waitForStart).toBe(true);
    });

    it("VOICEVOX_DEFAULT_WAIT_FOR_END=true の場合、デフォルトで waitForEnd が true になる", async () => {
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = "true";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.waitForEnd).toBe(true);
    });

    it("複数の環境変数が設定された場合、すべて適用される", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "false";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "true";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = "true";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(false);
      expect(defaultOptions.waitForStart).toBe(true);
      expect(defaultOptions.waitForEnd).toBe(true);
    });

    it("環境変数が設定されていない場合、デフォルト値が使用される", async () => {
      delete process.env.VOICEVOX_DEFAULT_IMMEDIATE;
      delete process.env.VOICEVOX_DEFAULT_WAIT_FOR_START;
      delete process.env.VOICEVOX_DEFAULT_WAIT_FOR_END;

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(true);  // デフォルト値
      expect(defaultOptions.waitForStart).toBe(false);  // デフォルト値
      expect(defaultOptions.waitForEnd).toBe(false);  // デフォルト値
    });
  });

  describe("設定オブジェクトと環境変数の優先順位", () => {
    it("環境変数が設定オブジェクトをオーバーライドする", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "false";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "true";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
        defaultPlaybackOptions: {
          immediate: true,
          waitForStart: false,
          waitForEnd: true,
        },
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      // 環境変数が優先される
      expect(defaultOptions.immediate).toBe(false);
      expect(defaultOptions.waitForStart).toBe(true);
      // 環境変数が設定されていないものは設定オブジェクトの値が使われる
      expect(defaultOptions.waitForEnd).toBe(true);
    });

    it("環境変数が設定されていない項目は設定オブジェクトの値が使われる", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "false";
      // waitForStart と waitForEnd は環境変数で設定しない

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
        defaultPlaybackOptions: {
          immediate: true,
          waitForStart: true,
          waitForEnd: true,
        },
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(false); // 環境変数から
      expect(defaultOptions.waitForStart).toBe(true); // 設定オブジェクトから
      expect(defaultOptions.waitForEnd).toBe(true); // 設定オブジェクトから
    });
  });

  describe("無効な環境変数値の処理", () => {
    it("true/false 以外の値は無視され、デフォルト値が使用される", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "invalid";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "1";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_END = "yes";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(true);  // デフォルト値
      expect(defaultOptions.waitForStart).toBe(false);  // デフォルト値
      expect(defaultOptions.waitForEnd).toBe(false);  // デフォルト値
    });

    it("空文字列は無視され、デフォルト値が使用される", async () => {
      process.env.VOICEVOX_DEFAULT_IMMEDIATE = "";
      process.env.VOICEVOX_DEFAULT_WAIT_FOR_START = "";

      const config: VoicevoxConfig = {
        url: "http://localhost:50021",
        defaultSpeaker: 1,
      };

      const client = new VoicevoxClient(config);
      
      const defaultOptions = (client as any).defaultPlaybackOptions;
      
      expect(defaultOptions.immediate).toBe(true);  // デフォルト値
      expect(defaultOptions.waitForStart).toBe(false);  // デフォルト値
    });
  });
});