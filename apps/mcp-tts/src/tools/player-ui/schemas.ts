import * as z from 'zod'

export const moraSchema = z.object({
  text: z.string(),
  consonant: z.string().nullable().optional(),
  consonant_length: z.number().nullable().optional(),
  vowel: z.string(),
  vowel_length: z.number(),
  pitch: z.number(),
})

export const accentPhraseSchema = z.object({
  moras: z.array(moraSchema),
  accent: z.number().int(),
  pause_mora: moraSchema.nullable().optional(),
  is_interrogative: z.boolean().nullable().optional(),
})

export const audioQuerySchema = z.object({
  accent_phrases: z.array(accentPhraseSchema),
  speedScale: z.number(),
  pitchScale: z.number(),
  intonationScale: z.number(),
  volumeScale: z.number(),
  prePhonemeLength: z.number(),
  postPhonemeLength: z.number(),
  outputSamplingRate: z.number(),
  outputStereo: z.boolean(),
  kana: z.string().optional(),
  pauseLengthScale: z.number().optional(),
})
