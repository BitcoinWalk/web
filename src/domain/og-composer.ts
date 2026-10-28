import { z } from "zod";
import { bitcoinWalkMarkIdSchema } from "./brand-marks";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const layer = z
  .object({
    x: z.number().min(0).max(1200),
    y: z.number().min(0).max(630),
    width: z.number().min(32).max(1200),
  })
  .strict();
export const ogCompositionSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(80),
    background: z
      .object({
        hash,
        source: z.enum(["upload", "url", "generated"]),
        zoom: z.number().min(1).max(2.5),
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        sourceUrl: z.string().url().optional(),
        prompt: z.string().max(1000).optional(),
        model: z.string().max(120).optional(),
      })
      .strict(),
    mark: layer.extend({
      visible: z.boolean(),
      variant: bitcoinWalkMarkIdSchema.default("traditional"),
    }),
    text: z
      .object({
        value: z.string().max(140),
        x: z.number().min(0).max(1200),
        y: z.number().min(0).max(630),
        width: z.number().min(160).max(1120),
        fontSize: z.number().int().min(24).max(112),
        align: z.enum(["left", "center", "right"]),
        color: z.enum(["#ffffff", "#17120d"]),
        treatment: z.enum(["shadow", "panel", "none"]),
      })
      .strict(),
    logo: layer
      .extend({
        hash,
        source: z.enum(["catalogue", "upload"]),
        approvalEventId: hash.optional(),
        label: z.string().max(80).optional(),
      })
      .nullable(),
  })
  .strict();
export type OgComposition = z.infer<typeof ogCompositionSchema>;
export type OgSource = {
  hash: string;
  dataUrl: string;
  source: "upload" | "url" | "generated";
  sourceUrl?: string;
  prompt?: string;
  model?: string;
};
