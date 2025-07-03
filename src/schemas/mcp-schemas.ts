import { z } from "zod";

// テキストセグメントスキーマ
export const TextSegmentSchema = z.object({
  text: z.string().min(1).describe("Text content to synthesize"),
  speaker: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Speaker ID in 'name-{id}' format or numeric ID for this specific text segment"),
});

// テキスト入力スキーマ
export const TextInputSchema = z
  .string()
  .describe(
    'Text string with line breaks and optional speaker prefix "1:Hello\\n2:World". For faster playback start, make the first element short.'
  );

// 共通パラメータスキーマ
export const CommonParametersSchema = {
  speaker: z.union([z.string(), z.number()]).optional().describe("Speaker ID in 'name-{id}' format or numeric ID for backward compatibility (optional)"),
  speedScale: z
    .number()
    .optional()
    .describe("Playback speed (optional, default from environment)"),
};

// 再生オプションスキーマ
export const PlaybackOptionsSchema = {
  immediate: z
    .boolean()
    .optional()
    .describe("Start playback immediately (optional, default: true)"),
  waitForStart: z
    .boolean()
    .optional()
    .describe("Wait for playback to start (optional, default: false)"),
  waitForEnd: z
    .boolean()
    .optional()
    .describe("Wait for playback to end (optional, default: false)"),
};