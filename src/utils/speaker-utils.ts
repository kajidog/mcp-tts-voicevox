import { VoicevoxClient, SharedQueueManager } from "../../packages/voicevox-client/dist/index.js";
import { VoiceEngineManager } from "@kajidog/voice-engine-manager";

// Speaker解析結果の型定義
export interface ParsedSpeaker {
  engineName: string;
  speakerId: number;
}

/**
 * スピーカー指定を解析（engine-id形式 or 数値）
 */
export const parseSpeaker = (speaker: string | number, defaultEngineName: string, engineManager: VoiceEngineManager): ParsedSpeaker => {
  // 数値の場合は後方互換性のためデフォルトエンジンを使用
  if (typeof speaker === 'number') {
    return {
      engineName: defaultEngineName,
      speakerId: speaker
    };
  }

  // name-{id} 形式の解析
  const match = speaker.match(/^([a-zA-Z0-9_-]+)-(\d+)$/);
  if (match) {
    const engineName = match[1];
    const speakerId = parseInt(match[2], 10);
    
    // エンジンが存在するかチェック
    const engine = engineManager.getEngine(engineName);
    if (!engine) {
      throw new Error(`エンジン '${engineName}' が見つかりません。利用可能なエンジン: ${engineManager.list().map(e => e.name).join(', ')}`);
    }
    
    return {
      engineName,
      speakerId
    };
  }

  throw new Error(`無効なspeaker形式: ${speaker}. 形式: 'name-{id}' または数値`);
};

/**
 * エンジン用のVoicevoxClientを取得または作成（キャッシュ付き）
 */
export const getEngineClient = async (
  engineName: string, 
  engineManager: VoiceEngineManager,
  clientCache: Map<string, VoicevoxClient>,
  sharedQueueManager?: SharedQueueManager
): Promise<VoicevoxClient> => {
  // キャッシュから取得
  const cached = clientCache.get(engineName);
  if (cached) {
    return cached;
  }

  // エンジンインスタンスを取得
  const engine = engineManager.getEngine(engineName);
  if (!engine) {
    throw new Error(`エンジン '${engineName}' が見つかりません`);
  }
  
  const config = engine.getConfig();
  const defaultSpeaker = config.default_speaker ?? engine.getDefaultSpeaker();
  const url = config.url ?? engine.getDefaultUrl();
  
  // 新しいクライアントを作成してキャッシュ
  const client = new VoicevoxClient({
    url,
    defaultSpeaker: typeof defaultSpeaker === 'number' ? defaultSpeaker : Number(defaultSpeaker),
    defaultSpeedScale: config.speedScale ?? Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE || "1.0"),
  });
  
  // 共有キューマネージャーが提供されている場合は設定
  if (sharedQueueManager) {
    client.setSharedQueue(sharedQueueManager, engineName);
  }
  
  clientCache.set(engineName, client);
  return client;
};

/**
 * デフォルトスピーカー解析
 */
export const getDefaultSpeaker = (defaultEngineName: string, engineManager: VoiceEngineManager): ParsedSpeaker => {
  const defaultEngineInstance = engineManager.getEngine(defaultEngineName);
  if (defaultEngineInstance) {
    const config = defaultEngineInstance.getConfig();
    const defaultSpeaker = config.default_speaker ?? defaultEngineInstance.getDefaultSpeaker();
    return {
      engineName: defaultEngineName,
      speakerId: typeof defaultSpeaker === 'number' ? defaultSpeaker : Number(defaultSpeaker)
    };
  } else {
    return { engineName: defaultEngineName, speakerId: 1 };
  }
};