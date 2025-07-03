import { z } from "zod";
import { VoicevoxClient, SharedQueueManager } from "../../packages/voicevox-client/dist/index.js";
import { VoiceEngineManager } from "@kajidog/voice-engine-manager";
import { CommonParametersSchema } from "../schemas/mcp-schemas";
import { createErrorResponse, createSuccessResponse, parseAudioQuery } from "../utils/mcp-utils";
import { parseSpeaker, getEngineClient, getDefaultSpeaker, ParsedSpeaker } from "../utils/speaker-utils";

export interface SynthesisToolDependencies {
  engineManager: VoiceEngineManager;
  clientCache: Map<string, VoicevoxClient>;
  defaultEngineName: string;
  sharedQueueManager: SharedQueueManager;
}

/**
 * generate_queryツールのスキーマ
 */
export const generateQueryToolSchema = {
  text: z.string().describe("Text for voice synthesis"),
  ...CommonParametersSchema,
};

// For type inference
const generateQueryZodSchema = z.object(generateQueryToolSchema);

/**
 * generate_queryツールのハンドラー
 */
export const generateQueryToolHandler = (deps: SynthesisToolDependencies) => async ({
  text,
  speaker,
  speedScale,
}: z.infer<typeof generateQueryZodSchema>) => {
  try {
    let parsedSpeaker: ParsedSpeaker;
    if (speaker) {
      parsedSpeaker = parseSpeaker(speaker, deps.defaultEngineName, deps.engineManager);
    } else {
      parsedSpeaker = getDefaultSpeaker(deps.defaultEngineName, deps.engineManager);
    }
    
    const client = await getEngineClient(parsedSpeaker.engineName, deps.engineManager, deps.clientCache, deps.sharedQueueManager);
    const query = await client.generateQuery(
      text,
      parsedSpeaker.speakerId,
      speedScale
    );
    return createSuccessResponse(JSON.stringify(query));
  } catch (error) {
    return createErrorResponse(error, 'generate_queryツールの実行中');
  }
};

/**
 * synthesize_fileツールのスキーマ
 */
export const synthesizeFileToolSchema = {
  text: z
    .string()
    .optional()
    .describe(
      "Text for voice synthesis (if both query and text provided, query takes precedence)"
    ),
  query: z.string().optional().describe("Voice synthesis query"),
  output: z.string().describe("Output path for the audio file"),
  ...CommonParametersSchema,
};

// For type inference
const synthesizeFileZodSchema = z.object(synthesizeFileToolSchema);

/**
 * synthesize_fileツールのハンドラー
 */
export const synthesizeFileToolHandler = (deps: SynthesisToolDependencies) => async ({
  text,
  query,
  speaker,
  output,
  speedScale,
}: z.infer<typeof synthesizeFileZodSchema>) => {
  try {
    let parsedSpeaker: ParsedSpeaker;
    if (speaker) {
      parsedSpeaker = parseSpeaker(speaker, deps.defaultEngineName, deps.engineManager);
    } else {
      parsedSpeaker = getDefaultSpeaker(deps.defaultEngineName, deps.engineManager);
    }
    
    const client = await getEngineClient(parsedSpeaker.engineName, deps.engineManager, deps.clientCache, deps.sharedQueueManager);

    if (query) {
      const audioQuery = parseAudioQuery(query, speedScale);
      const filePath = await client.generateAudioFile(
        audioQuery,
        output,
        parsedSpeaker.speakerId
      );
      return createSuccessResponse(filePath);
    }

    if (text) {
      const filePath = await client.generateAudioFile(
        text,
        output,
        parsedSpeaker.speakerId,
        speedScale
      );
      return createSuccessResponse(filePath);
    }

    throw new Error(
      "queryパラメータとtextパラメータのどちらかを指定してください"
    );
  } catch (error) {
    return createErrorResponse(error, 'synthesize_fileツールの実行中');
  }
};