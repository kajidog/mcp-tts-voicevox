import { parseEngineConfigs } from "../../config/engine-config";

// 環境変数をテスト用に制御
const originalEnv = process.env;

describe("Engine Config", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // テスト用にクリーンアップ
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VOICEVOX_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("parseEngineConfigs", () => {
    it("デフォルト設定（環境変数なし）でVOICEVOXとAivisSpeechの両エンジンを返す", () => {
      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(2);
      expect(configs[0]).toMatchObject({
        name: "voicevox",
        type: "voicevox",
        url: "http://localhost:50021",
        priority: 1,
        default_speaker: 1,
      });
      expect(configs[1]).toMatchObject({
        name: "aivis",
        type: "aivisspeech", 
        url: "http://localhost:10101",
        priority: 2,
        default_speaker: 888753764,
      });
    });

    it("カンマ区切り環境変数を正しく解析する", () => {
      process.env.VOICEVOX_ENGINES = "engine1,engine2";
      process.env.VOICEVOX_engine1_type = "voicevox";
      process.env.VOICEVOX_engine1_url = "http://localhost:50021";
      process.env.VOICEVOX_engine2_type = "aivisspeech";
      process.env.VOICEVOX_engine2_url = "http://localhost:10101";

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(2);
      expect(configs.find(c => c.name === "engine1")).toMatchObject({
        name: "engine1",
        type: "voicevox",
        url: "http://localhost:50021",
      });
      expect(configs.find(c => c.name === "engine2")).toMatchObject({
        name: "engine2", 
        type: "aivisspeech",
        url: "http://localhost:10101",
      });
    });

    it("ドット記法環境変数を正しく解析する", () => {
      process.env.VOICEVOX_ENGINES = "main";
      process.env["VOICEVOX_ENGINES.main.type"] = "voicevox";
      process.env["VOICEVOX_ENGINES.main.url"] = "http://localhost:50021";
      process.env["VOICEVOX_ENGINES.main.priority"] = "1";

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(1);
      expect(configs[0]).toMatchObject({
        name: "main",
        type: "voicevox", 
        url: "http://localhost:50021",
        priority: 1,
      });
    });

    it("JSON配列形式の環境変数を正しく解析する", () => {
      const engineConfigsJson = JSON.stringify([
        {
          name: "main",
          type: "voicevox",
          url: "http://localhost:50021",
          priority: 1,
        },
        {
          name: "aivis",
          type: "aivisspeech", 
          url: "http://localhost:10101",
          priority: 2,
        },
      ]);
      process.env.VOICEVOX_ENGINES = engineConfigsJson;

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(2);
      expect(configs[0]).toMatchObject({
        name: "main",
        type: "voicevox",
        url: "http://localhost:50021", 
        priority: 1,
      });
      expect(configs[1]).toMatchObject({
        name: "aivis",
        type: "aivisspeech",
        url: "http://localhost:10101",
        priority: 2,
      });
    });

    it("レガシー形式（VOICEVOX_URL）を正しく解析する", () => {
      process.env.VOICEVOX_URL = "http://localhost:50025";
      process.env.VOICEVOX_DEFAULT_SPEAKER = "3";

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(1);
      expect(configs[0]).toMatchObject({
        name: "main",
        type: "voicevox",
        url: "http://localhost:50025",
        default_speaker: 3,
      });
    });

    it("デフォルト値が正しく設定される", () => {
      process.env.VOICEVOX_ENGINES = "test";
      process.env.VOICEVOX_test_type = "voicevox";
      // URLやpriorityは未指定

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(1);
      expect(configs[0]).toMatchObject({
        name: "test",
        type: "voicevox",
        url: "http://localhost:50021", // デフォルト
        priority: 1, // デフォルト
      });
    });

    it("AivisSpeechのデフォルト値が正しく設定される", () => {
      process.env.VOICEVOX_ENGINES = "aivis";
      process.env.VOICEVOX_aivis_type = "aivisspeech";

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(1);
      expect(configs[0]).toMatchObject({
        name: "aivis",
        type: "aivisspeech",
        url: "http://localhost:10101", // AivisSpeechのデフォルト
        default_speaker: 888753764, // AivisSpeechのデフォルト
      });
    });

    it("不正なJSON配列は無視してデフォルトにフォールバック", () => {
      process.env.VOICEVOX_ENGINES = "invalid json [";

      const configs = parseEngineConfigs();
      
      // デフォルト設定にフォールバック
      expect(configs).toHaveLength(2);
      expect(configs[0].name).toBe("voicevox");
      expect(configs[1].name).toBe("aivis");
    });

    it("優先度順でソートされる", () => {
      process.env.VOICEVOX_ENGINES = "low,high";
      process.env.VOICEVOX_low_type = "voicevox";
      process.env.VOICEVOX_low_priority = "5";
      process.env.VOICEVOX_high_type = "aivisspeech";
      process.env.VOICEVOX_high_priority = "1";

      const configs = parseEngineConfigs();
      
      expect(configs).toHaveLength(2);
      // 優先度順（1が最高優先度）
      expect(configs[0].name).toBe("high");
      expect(configs[0].priority).toBe(1);
      expect(configs[1].name).toBe("low");
      expect(configs[1].priority).toBe(5);
    });
  });
});