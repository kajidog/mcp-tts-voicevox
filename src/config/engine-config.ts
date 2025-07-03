import { 
  EngineConfig,
  EngineFactory,
  DEFAULT_ENGINE_URLS,
  DEFAULT_SPEAKERS,
  KNOWN_ENGINE_TYPES
} from "@kajidog/voice-engine-manager";

/**
 * 環境変数からエンジン設定を解析
 */
export function parseEngineConfigs(): EngineConfig[] {
  // 環境変数からエンジン設定を読み込み（優先度順）
  
  // 1. ドット記法またはカンマ区切り形式
  const dotNotationConfigs = parseDotNotationEngines();
  if (dotNotationConfigs.length > 0) {
    console.log(`ドット記法/カンマ区切り環境変数から${dotNotationConfigs.length}個のエンジン設定を読み込みました`);
    return dotNotationConfigs;
  }

  // 2. JSON配列形式（後方互換性）
  const enginesEnv = process.env.VOICEVOX_ENGINES;
  if (enginesEnv) {
    try {
      const parsed = JSON.parse(enginesEnv);
      if (Array.isArray(parsed)) {
        console.log(`JSON配列形式の環境変数から${parsed.length}個のエンジン設定を読み込みました`);
        return parsed.map((config: any) => ({
          name: config.name || 'default',
          type: config.type || 'voicevox',
          url: config.url || DEFAULT_ENGINE_URLS[config.type] || 'http://localhost:50021',
          priority: config.priority ?? 1,
          boot_command: config.boot_command || 'deny',
          default_speaker: config.default_speaker,
          speedScale: config.speedScale,
          pitchScale: config.pitchScale,
          intonationScale: config.intonationScale,
          volumeScale: config.volumeScale
        }));
      }
    } catch (error) {
      // JSON解析に失敗した場合は、カンマ区切り形式の可能性があるので
      // エラーを出力せずに次の形式を試行
    }
  }

  // 3. 単一エンジン設定（後方互換性）
  const legacyUrl = process.env.VOICEVOX_URL;
  if (legacyUrl) {
    console.log(`レガシー形式の環境変数から1個のエンジン設定を読み込みました`);
    return [{
      name: 'main',
      type: 'voicevox',
      url: legacyUrl,
      priority: 1,
      boot_command: 'deny',
      default_speaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER || "1"),
      speedScale: Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE || "1.0")
    }];
  }

  // 4. デフォルト設定（VOICEVOX + AivisSpeech）
  console.log(`環境変数が未設定のため、デフォルトの2個のエンジン設定を使用します`);
  return [
    {
      name: 'voicevox',
      type: KNOWN_ENGINE_TYPES.VOICEVOX,
      url: DEFAULT_ENGINE_URLS[KNOWN_ENGINE_TYPES.VOICEVOX],
      priority: 1,
      boot_command: 'deny',
      default_speaker: DEFAULT_SPEAKERS[KNOWN_ENGINE_TYPES.VOICEVOX]
    },
    {
      name: 'aivis',
      type: KNOWN_ENGINE_TYPES.AIVISSPEECH,
      url: DEFAULT_ENGINE_URLS[KNOWN_ENGINE_TYPES.AIVISSPEECH],
      priority: 2,
      boot_command: 'deny',
      default_speaker: DEFAULT_SPEAKERS[KNOWN_ENGINE_TYPES.AIVISSPEECH]
    }
  ];
}

/**
 * ドット記法またはカンマ区切り + 個別環境変数の解析
 */
function parseDotNotationEngines(): EngineConfig[] {
  const enginesEnv = process.env.VOICEVOX_ENGINES;
  if (!enginesEnv) {
    return [];
  }

  const engineNames = enginesEnv.split(',').map(name => name.trim()).filter(name => name);
  const engines: EngineConfig[] = [];

  for (const engineName of engineNames) {
    const typeEnv = process.env[`VOICEVOX_${engineName}_type`] || process.env[`VOICEVOX_ENGINES.${engineName}.type`];
    if (!typeEnv) {
      console.warn(`エンジン '${engineName}' の type が未設定です。スキップします。`);
      continue;
    }
    
    // EngineFactoryでサポートされているか確認
    if (!EngineFactory.isTypeSupported(typeEnv)) {
      console.warn(`エンジンタイプ '${typeEnv}' はサポートされていません。サポートされているタイプ: ${EngineFactory.getSupportedTypes().join(', ')}`);
      continue;
    }

    // ドット記法とアンダースコア記法の両方をサポート
    const getEnvValue = (key: string): string | undefined => {
      return process.env[`VOICEVOX_${engineName}_${key}`] || process.env[`VOICEVOX_ENGINES.${engineName}.${key}`];
    };

    const engine: EngineConfig = {
      name: engineName,
      type: typeEnv,
      url: getEnvValue('url') || DEFAULT_ENGINE_URLS[typeEnv] || 'http://localhost:50021',
      priority: parseInt(getEnvValue('priority') || '1', 10),
      boot_command: getEnvValue('boot_command') || 'deny'
    };

    // オプション設定の追加
    const defaultSpeaker = getEnvValue('default_speaker');
    if (defaultSpeaker) {
      const speakerNum = parseInt(defaultSpeaker, 10);
      engine.default_speaker = isNaN(speakerNum) ? defaultSpeaker : speakerNum;
    } else if (DEFAULT_SPEAKERS[typeEnv]) {
      engine.default_speaker = DEFAULT_SPEAKERS[typeEnv];
    }

    // 数値パラメータの読み込みヘルパー
    const parseFloatValue = (value: string | undefined): number | undefined => {
      if (!value) return undefined;
      const parsed = Number(value);
      return isNaN(parsed) ? undefined : parsed;
    };

    // 各種スケール設定
    engine.speedScale = parseFloatValue(getEnvValue('speed_scale'));
    engine.pitchScale = parseFloatValue(getEnvValue('pitch_scale'));
    engine.intonationScale = parseFloatValue(getEnvValue('intonation_scale'));
    engine.volumeScale = parseFloatValue(getEnvValue('volume_scale'));

    engines.push(engine);
  }

  return engines.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}