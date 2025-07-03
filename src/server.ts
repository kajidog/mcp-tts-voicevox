import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VoicevoxClient, SharedQueueManager } from "../packages/voicevox-client/dist/index.js";
import { 
  VoiceEngineManager,
  EngineFactory,
} from "@kajidog/voice-engine-manager";

// 設定とユーティリティのインポート
import { parseEngineConfigs } from "./config/engine-config";

// ツールハンドラーのインポート
import {
  speakToolSchema,
  speakToolHandler,
  generateQueryToolSchema,
  generateQueryToolHandler,
  synthesizeFileToolSchema,
  synthesizeFileToolHandler,
  stopSpeakerToolSchema,
  stopSpeakerToolHandler,
  getSpeakersToolHandler,
  startEngineToolSchema,
  startEngineToolHandler,
  getEngineStatusToolSchema,
  getEngineStatusToolHandler,
} from "./tools";

// サーバー初期化
export const server = new McpServer({
  name: "MCP TTS Voicevox",
  version: "0.2.2",
  description:
    "A multi-engine voice synthesis server supporting VOICEVOX and AivisSpeech.",
});

// エンジン設定の読み込み
const engineConfigs = parseEngineConfigs();

// 新しいDDDアーキテクチャを使用したエンジンマネージャー初期化
const factory = new EngineFactory();
const engines = engineConfigs.map(config => factory.createEngine(config));
const engineManager = new VoiceEngineManager(engines);

// 共有キューマネージャーを作成
const sharedQueueManager = new SharedQueueManager();

// エンジンごとのクライアントキャッシュ
const clientCache = new Map<string, VoicevoxClient>();

// デフォルトエンジンの決定（優先度順）
const sortedEngines = [...engineConfigs].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
const defaultEngineName = sortedEngines[0]?.name || 'main';

// 共通の依存関係オブジェクト
const toolDependencies = {
  engineManager,
  clientCache,
  defaultEngineName,
  sharedQueueManager,
};

// MCPツールの登録
server.tool(
  "speak",
  "Convert text to speech and play it",
  speakToolSchema,
  speakToolHandler(toolDependencies)
);

server.tool(
  "generate_query",
  "Generate a query for voice synthesis",
  generateQueryToolSchema,
  generateQueryToolHandler(toolDependencies)
);

server.tool(
  "synthesize_file",
  "Generate an audio file and return its absolute path",
  synthesizeFileToolSchema,
  synthesizeFileToolHandler(toolDependencies)
);

server.tool(
  "stop_speaker",
  "Stop the current speaker",
  stopSpeakerToolSchema,
  stopSpeakerToolHandler(toolDependencies)
);

server.tool(
  "get_speakers",
  "Get a list of available speakers from all online engines",
  {},
  getSpeakersToolHandler(toolDependencies)
);

// エンジン管理ツール（環境変数に設定がある場合のみ登録）
if (engineConfigs.length > 0) {
  server.tool(
    "start_engine",
    "Start voice engine(s)",
    startEngineToolSchema,
    startEngineToolHandler(toolDependencies)
  );
}

server.tool(
  "get_engine_status",
  "Get engine status information",
  getEngineStatusToolSchema,
  getEngineStatusToolHandler(toolDependencies)
);