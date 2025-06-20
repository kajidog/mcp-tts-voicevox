import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VoicevoxClient, AudioQuery } from "@kajidog/voicevox-client";

// 型定義
const TextSegmentSchema = z.object({
  text: z.string().describe("Text content to synthesize"),
  speaker: z
    .number()
    .optional()
    .describe("Speaker ID for this specific text segment"),
});

const TextInputSchema = z
  .union([
    z.string().describe("Text with optional speaker prefix (e.g., '1:Hello\\n2:World')"),
    z.array(z.string()),
    z.array(TextSegmentSchema)
  ])
  .describe(
    'Text string with line breaks and optional speaker prefix "1:Hello\\n2:World", array of strings ["Hello", "World"], or objects [{"text": "Hello"}, {"text": "World", "speaker": 3}] for individual speaker control. For faster playback start, make the first element short.'
  );

const CommonParametersSchema = {
  speaker: z.number().optional().describe("Default speaker ID (optional)"),
  speedScale: z
    .number()
    .optional()
    .describe("Playback speed (optional, default from environment)"),
};

// サーバー初期化
export const server = new McpServer({
  name: "MCP TTS Voicevox",
  version: "0.1.1",
  description:
    "A Voicevox server that converts text to speech for playback and saving.",
});

// Voicevoxクライアント初期化
const voicevoxClient = new VoicevoxClient({
  url: process.env.VOICEVOX_URL ?? "http://localhost:50021",
  defaultSpeaker: Number(process.env.VOICEVOX_DEFAULT_SPEAKER || "1"),
  defaultSpeedScale: Number(process.env.VOICEVOX_DEFAULT_SPEED_SCALE || "1.0"),
});

// ユーティリティ関数
const createErrorResponse = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
});

const createSuccessResponse = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const parseAudioQuery = (query: string, speedScale?: number): AudioQuery => {
  const audioQuery = JSON.parse(query) as AudioQuery;
  if (speedScale !== undefined) {
    audioQuery.speedScale = speedScale;
  }
  return audioQuery;
};

const parseStringInput = (input: string): Array<{ text: string; speaker?: number }> => {
  const lines = input.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const match = line.match(/^(\d+):(.*)$/);
    if (match) {
      return { text: match[2].trim(), speaker: parseInt(match[1], 10) };
    }
    return { text: line };
  });
};

const processTextInput = async (
  text: string | string[] | Array<{ text: string; speaker?: number }>,
  speaker?: number,
  speedScale?: number
) => {
  // Handle string input with line breaks and optional speaker prefix
  if (typeof text === "string") {
    const segments = parseStringInput(text);
    return await voicevoxClient.speak(segments, speaker, speedScale);
  }

  if (!Array.isArray(text) || text.length === 0) {
    throw new Error("Invalid text format. Provide non-empty array.");
  }

  if (typeof text[0] === "string") {
    return await voicevoxClient.speak(text as string[], speaker, speedScale);
  } else if (typeof text[0] === "object" && "text" in text[0]) {
    const segments = text as Array<{ text: string; speaker?: number }>;
    return await voicevoxClient.speak(segments, speaker, speedScale);
  }

  throw new Error(
    "Invalid text format. Provide array of strings or objects with 'text' property."
  );
};

// ツール定義
server.tool(
  "speak",
  "Convert text to speech and play it",
  {
    text: TextInputSchema,
    ...CommonParametersSchema,
    query: z.string().optional().describe("Voice synthesis query"),
  },
  async ({ text, speaker, query, speedScale }) => {
    try {
      if (query) {
        const audioQuery = parseAudioQuery(query, speedScale);
        const result = await voicevoxClient.enqueueAudioGeneration(
          audioQuery,
          speaker
        );
        return createSuccessResponse(result);
      }

      const result = await processTextInput(text, speaker, speedScale);
      return createSuccessResponse(result);
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);

server.tool(
  "generate_query",
  "Generate a query for voice synthesis",
  {
    text: z.string().describe("Text for voice synthesis"),
    ...CommonParametersSchema,
  },
  async ({ text, speaker, speedScale }) => {
    try {
      const query = await voicevoxClient.generateQuery(
        text,
        speaker,
        speedScale
      );
      return createSuccessResponse(JSON.stringify(query));
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);

server.tool(
  "synthesize_file",
  "Generate an audio file and return its absolute path",
  {
    text: z
      .string()
      .optional()
      .describe(
        "Text for voice synthesis (if both query and text provided, query takes precedence)"
      ),
    query: z.string().optional().describe("Voice synthesis query"),
    output: z.string().describe("Output path for the audio file"),
    ...CommonParametersSchema,
  },
  async ({ text, query, speaker, output, speedScale }) => {
    try {
      if (query) {
        const audioQuery = parseAudioQuery(query, speedScale);
        const filePath = await voicevoxClient.generateAudioFile(
          audioQuery,
          output,
          speaker
        );
        return createSuccessResponse(filePath);
      }

      if (text) {
        const filePath = await voicevoxClient.generateAudioFile(
          text,
          output,
          speaker,
          speedScale
        );
        return createSuccessResponse(filePath);
      }

      throw new Error(
        "queryパラメータとtextパラメータのどちらかを指定してください"
      );
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);

server.tool(
  "stop_speaker",
  "Stop the current speaker",
  {
    random_string: z
      .string()
      .describe("Dummy parameter for no-parameter tools"),
  },
  async () => {
    try {
      await voicevoxClient.clearQueue();
      return createSuccessResponse("スピーカーを停止しました");
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);

server.tool(
  "get_speakers",
  "Get a list of available speakers",
  {},
  async () => {
    try {
      const speakers = await voicevoxClient.getSpeakers();
      const result = speakers.flatMap((speaker) =>
        speaker.styles.map((style) => ({
          uuid: speaker.speaker_uuid,
          speaker: style.id,
          name: `${speaker.name}:${style.name}`,
        }))
      );
      return createSuccessResponse(JSON.stringify(result));
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);

server.tool(
  "get_speaker_detail",
  "Get detail of a speaker by id",
  {
    uuid: z.string().describe("Speaker UUID (speaker uuid)"),
  },
  async ({ uuid }) => {
    try {
      const allSpeakers = await voicevoxClient.getSpeakers();
      const targetSpeaker = allSpeakers.find(
        (speaker) => speaker.speaker_uuid === uuid
      );

      if (!targetSpeaker) {
        throw new Error(
          `指定されたUUID ${uuid} のスピーカーが見つかりませんでした`
        );
      }

      const styles = targetSpeaker.styles.map((style) => ({
        id: style.id,
        name: style.name,
        type: style.type || "normal",
      }));

      const simplifiedInfo = {
        uuid: targetSpeaker.speaker_uuid,
        name: targetSpeaker.name,
        version: targetSpeaker.version,
        supported_features: targetSpeaker.supported_features,
        styles: styles,
      };

      return createSuccessResponse(JSON.stringify(simplifiedInfo));
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);
