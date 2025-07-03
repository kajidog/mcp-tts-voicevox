import { z } from "zod";
import { VoicevoxClient, SharedQueueManager } from "../../packages/voicevox-client/dist/index.js";
import { VoiceEngineManager, FilterOptions } from "@kajidog/voice-engine-manager";
import { createErrorResponse, createSuccessResponse } from "../utils/mcp-utils";
import { getEngineClient } from "../utils/speaker-utils";

export interface EngineToolDependencies {
  engineManager: VoiceEngineManager;
  clientCache: Map<string, VoicevoxClient>;
  sharedQueueManager: SharedQueueManager;
}

/**
 * stop_speakerツールのスキーマ
 */
export const stopSpeakerToolSchema = {
  random_string: z
    .string()
    .describe("Dummy parameter for no-parameter tools"),
};

/**
 * stop_speakerツールのハンドラー
 */
export const stopSpeakerToolHandler = (deps: EngineToolDependencies) => async () => {
  try {
    // 共有キューをクリア
    await deps.sharedQueueManager.clearQueue();
    
    // 全エンジンのクライアントキューもクリア（後方互換性のため）
    const clearPromises = Array.from(deps.clientCache.values()).map(client => 
      client.clearQueue().catch(err => console.warn(`キューのクリアに失敗:`, err))
    );
    await Promise.all(clearPromises);
    return createSuccessResponse("全てのスピーカーを停止しました");
  } catch (error) {
    return createErrorResponse(error, 'stop_speakerツールの実行中');
  }
};

/**
 * get_speakersツールのハンドラー
 */
export const getSpeakersToolHandler = (deps: EngineToolDependencies) => async () => {
  try {
    // オンラインエンジンの情報を取得
    const onlineConfigs = await deps.engineManager.fetchOnlineConfig();
    const allSpeakers: Array<{ speaker: string; name: string }> = [];

    // 各オンラインエンジンからspeaker情報を取得
    for (const config of onlineConfigs) {
      try {
        const client = await getEngineClient(config.name, deps.engineManager, deps.clientCache, deps.sharedQueueManager);
        const speakers = await client.getSpeakers();
        
        const engineSpeakers = speakers.flatMap((speaker: any) =>
          speaker.styles.map((style: any) => ({
            speaker: `${config.name}-${style.id}`,
            name: `${speaker.name}:${style.name}`,
          }))
        );
        
        allSpeakers.push(...engineSpeakers);
      } catch (engineError) {
        console.error(`エンジン ${config.name} からのspeaker取得に失敗しました:`, engineError);
        // 個別エンジンのエラーは無視して続行
      }
    }

    return createSuccessResponse(JSON.stringify(allSpeakers));
  } catch (error) {
    return createErrorResponse(error, 'get_speakersツールの実行中');
  }
};

/**
 * start_engineツールのスキーマ
 */
export const startEngineToolSchema = {
  name: z.string().optional().describe("Engine name to start (optional, starts all if not specified)"),
  type: z.enum(["voicevox", "aivisspeech"]).optional().describe("Engine type filter (optional)")
};

// For type inference
const startEngineZodSchema = z.object(startEngineToolSchema);

/**
 * start_engineツールのハンドラー
 */
export const startEngineToolHandler = (deps: EngineToolDependencies) => async ({
  name,
  type,
}: z.infer<typeof startEngineZodSchema>) => {
  try {
    if (name) {
      // 特定のエンジンを起動
      const configs = deps.engineManager.getConfig({ name });
      if (configs.length === 0) {
        throw new Error(`エンジン '${name}' が見つかりません`);
      }
      
      if (type && configs[0].type !== type) {
        throw new Error(`エンジン '${name}' はタイプ '${type}' ではありません`);
      }
      
      await deps.engineManager.start(name);
      return createSuccessResponse(`エンジン '${name}' を起動しました`);
    } else if (type) {
      // タイプで絞り込んで起動
      const configs = deps.engineManager.getConfig({ type });
      if (configs.length === 0) {
        throw new Error(`タイプ '${type}' のエンジンが見つかりません`);
      }
      
      for (const config of configs) {
        await deps.engineManager.start(config.name);
      }
      
      return createSuccessResponse(`タイプ '${type}' のエンジン ${configs.length}個 を起動しました`);
    } else {
      // 全エンジンを起動
      const configs = deps.engineManager.getConfig();
      await deps.engineManager.start();
      return createSuccessResponse(`全エンジン ${configs.length}個 を起動しました`);
    }
  } catch (error) {
    return createErrorResponse(error, 'start_engineツールの実行中');
  }
};

/**
 * get_engine_statusツールのスキーマ
 */
export const getEngineStatusToolSchema = {
  name: z.string().optional().describe("Filter by engine name (optional)"),
  type: z.enum(["voicevox", "aivisspeech"]).optional().describe("Filter by engine type (optional)"),
  detailed: z.boolean().optional().describe("Include detailed health check (ping) information (optional, default: false)")
};

// For type inference
const getEngineStatusZodSchema = z.object(getEngineStatusToolSchema);

/**
 * get_engine_statusツールのハンドラー
 */
export const getEngineStatusToolHandler = (deps: EngineToolDependencies) => async ({
  name,
  type,
  detailed,
}: z.infer<typeof getEngineStatusZodSchema>) => {
  try {
    const filter: FilterOptions = {};
    if (name) filter.name = name;
    if (type) filter.type = type;

    if (detailed) {
      // 詳細情報（ping結果）を取得
      const statuses = await deps.engineManager.ping(filter);
      return createSuccessResponse(JSON.stringify(statuses));
    } else {
      // 基本情報を取得
      const engines = deps.engineManager.list();
      
      // フィルタリング
      let filteredEngines = engines;
      if (name) {
        filteredEngines = filteredEngines.filter(e => e.name === name);
      }
      if (type) {
        filteredEngines = filteredEngines.filter(e => e.type === type);
      }
      
      // 必要な情報のみを抽出
      const result = filteredEngines.map(engine => ({
        name: engine.name,
        type: engine.type,
        url: engine.url,
        priority: engine.priority,
        status: engine.status
      }));
      
      return createSuccessResponse(JSON.stringify(result));
    }
  } catch (error) {
    return createErrorResponse(error, 'get_engine_statusツールの実行中');
  }
};