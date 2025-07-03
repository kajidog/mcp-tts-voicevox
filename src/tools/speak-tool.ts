import { z } from "zod";
import { VoicevoxClient, SharedQueueManager } from "../../packages/voicevox-client/dist/index.js";
import { VoiceEngineManager } from "@kajidog/voice-engine-manager";
import { TextInputSchema, CommonParametersSchema, PlaybackOptionsSchema } from "../schemas/mcp-schemas";
import { createErrorResponse, createSuccessResponse, parseAudioQuery, parseStringInput } from "../utils/mcp-utils";
import { parseSpeaker, getEngineClient, getDefaultSpeaker, ParsedSpeaker } from "../utils/speaker-utils";

export interface SpeakToolDependencies {
  engineManager: VoiceEngineManager;
  clientCache: Map<string, VoicevoxClient>;
  defaultEngineName: string;
  sharedQueueManager: SharedQueueManager;
}

/**
 * speakツールのスキーマ
 */
export const speakToolSchema = {
  text: TextInputSchema,
  ...CommonParametersSchema,
  ...PlaybackOptionsSchema,
  query: z.string().optional().describe("Voice synthesis query"),
};

// For type inference
const speakToolZodSchema = z.object(speakToolSchema);

/**
 * speakツールのハンドラー
 */
export const speakToolHandler = (deps: SpeakToolDependencies) => async ({
  text,
  speaker,
  query,
  speedScale,
  immediate,
  waitForStart,
  waitForEnd,
}: z.infer<typeof speakToolZodSchema>) => {
  try {
    // 環境変数からデフォルトの再生オプションを取得
    const defaultImmediate = process.env.VOICEVOX_DEFAULT_IMMEDIATE !== "false";
    const defaultWaitForStart = process.env.VOICEVOX_DEFAULT_WAIT_FOR_START === "true";
    const defaultWaitForEnd = process.env.VOICEVOX_DEFAULT_WAIT_FOR_END === "true";

    const playbackOptions = {
      immediate: immediate ?? defaultImmediate,
      waitForStart: waitForStart ?? defaultWaitForStart,
      waitForEnd: waitForEnd ?? defaultWaitForEnd,
    };

    if (query) {
      const audioQuery = parseAudioQuery(query, speedScale);
      let parsedSpeaker: ParsedSpeaker;
      if (speaker) {
        parsedSpeaker = parseSpeaker(speaker, deps.defaultEngineName, deps.engineManager);
      } else {
        parsedSpeaker = getDefaultSpeaker(deps.defaultEngineName, deps.engineManager);
      }
      const client = await getEngineClient(parsedSpeaker.engineName, deps.engineManager, deps.clientCache, deps.sharedQueueManager);
      const result = await client.enqueueAudioGeneration(
        audioQuery,
        parsedSpeaker.speakerId,
        speedScale,
        playbackOptions
      );
      return createSuccessResponse(result);
    }

    const result = await processTextInput(
      text,
      speaker,
      speedScale,
      playbackOptions,
      deps
    );
    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error, 'speakツールの実行中');
  }
};

/**
 * テキスト入力の処理
 */
async function processTextInput(
  text: string,
  speaker?: string | number,
  speedScale?: number,
  playbackOptions?: {
    immediate?: boolean;
    waitForStart?: boolean;
    waitForEnd?: boolean;
  },
  deps?: SpeakToolDependencies
) {
  if (!deps) {
    throw new Error('Dependencies not provided');
  }

  const segments = parseStringInput(text);
  
  // セグメントごとに適切なエンジンクライアントを使用
  if (segments.length === 1 && !segments[0].speaker) {
    // 単一セグメントで固有speakerが指定されていない場合
    let parsedSpeaker: ParsedSpeaker;
    if (speaker) {
      parsedSpeaker = parseSpeaker(speaker, deps.defaultEngineName, deps.engineManager);
    } else {
      parsedSpeaker = getDefaultSpeaker(deps.defaultEngineName, deps.engineManager);
    }
    const client = await getEngineClient(parsedSpeaker.engineName, deps.engineManager, deps.clientCache, deps.sharedQueueManager);
    return await client.speak(segments[0].text, parsedSpeaker.speakerId, speedScale, playbackOptions);
  }
  
  // 複数セグメントまたはセグメント固有speakerがある場合
  const results: string[] = [];
  for (const segment of segments) {
    const effectiveSpeaker = segment.speaker || speaker;
    let parsedSpeaker: ParsedSpeaker;
    
    if (effectiveSpeaker) {
      parsedSpeaker = parseSpeaker(effectiveSpeaker, deps.defaultEngineName, deps.engineManager);
    } else {
      parsedSpeaker = getDefaultSpeaker(deps.defaultEngineName, deps.engineManager);
    }
    
    const client = await getEngineClient(parsedSpeaker.engineName, deps.engineManager, deps.clientCache, deps.sharedQueueManager);
    const result = await client.speak(segment.text, parsedSpeaker.speakerId, speedScale, playbackOptions);
    results.push(result);
  }
  
  return results.join('; ');
}