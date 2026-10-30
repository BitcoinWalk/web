import { z } from "zod";
import { bitcoinWalkMarkIdSchema } from "./brand-marks";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const ogAlignmentSchema = z.enum(["left", "center", "right"]);
export const ogVerticalAlignmentSchema = z.enum(["top", "center", "bottom"]);
export function ogRelativeTextLayout({
  align,
  verticalAlign,
  markWidth,
  markHeight,
  textWidth,
  textHeight,
  canvasWidth=1200,
  canvasHeight=630,
  edge=64,
  gap=15,
}: {
  align:z.infer<typeof ogAlignmentSchema>;
  verticalAlign:z.infer<typeof ogVerticalAlignmentSchema>;
  markWidth:number;
  markHeight:number;
  textWidth:number;
  textHeight:number;
  canvasWidth?:number;
  canvasHeight?:number;
  edge?:number;
  gap?:number;
}) {
  const hasMark=markWidth>0&&markHeight>0,
    hasText=textWidth>0&&textHeight>0,
    space=hasMark&&hasText?gap:0,
    groupWidth=Math.max(markWidth,textWidth),
    groupHeight=markHeight+space+textHeight,
    groupLeft=align==="left"?edge:align==="right"?canvasWidth-edge-groupWidth:(canvasWidth-groupWidth)/2,
    groupTop=verticalAlign==="top"?edge:verticalAlign==="bottom"?canvasHeight-edge-groupHeight:(canvasHeight-groupHeight)/2;
  return {
    markLeft:groupLeft+(groupWidth-markWidth)/2,
    markTop:groupTop,
    textLeft:groupLeft+(groupWidth-textWidth)/2,
    textTop:groupTop+markHeight+space,
    groupWidth,
    groupHeight,
  };
}
const layer = z
  .object({
    x: z.number().min(0).max(1200),
    y: z.number().min(0).max(630),
    width: z.number().min(32).max(1200),
  })
  .strict();
const background = z
  .object({
    hash,
    source: z.enum(["upload", "url", "generated", "city"]),
    zoom: z.number().min(1).max(2.5),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    sourceUrl: z.string().url().optional(),
    prompt: z.string().max(1000).optional(),
    model: z.string().max(120).optional(),
    cityId: z.string().uuid().optional(),
    cityName: z.string().trim().min(1).max(120).optional(),
    revisionId: hash.optional(),
    approvalId: hash.optional(),
  })
  .strict()
  .superRefine((value,context)=>{
    if(value.source!=="city")return;
    for(const key of ["sourceUrl","cityId","cityName","revisionId","approvalId"] as const)if(!value[key])context.addIssue({code:"custom",path:[key],message:"City backgrounds require exact approved-city provenance."});
  });
export const ogCompositionSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(80),
    background,
    mark: layer.extend({
      visible: z.boolean(),
      variant: bitcoinWalkMarkIdSchema.default("traditional"),
      align: ogAlignmentSchema.default("left"),
      verticalAlign: ogVerticalAlignmentSchema.default("top"),
    }),
    text: z
      .object({
        value: z.string().max(140),
        x: z.number().min(0).max(1200),
        y: z.number().min(0).max(630),
        width: z.number().min(160).max(1120),
        fontSize: z.number().int().min(24).max(180),
        align: ogAlignmentSchema,
        verticalAlign: ogVerticalAlignmentSchema.default("bottom"),
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
        align: ogAlignmentSchema.default("right"),
        verticalAlign: ogVerticalAlignmentSchema.default("bottom"),
      })
      .nullable(),
  })
  .strict();
export type OgComposition = z.infer<typeof ogCompositionSchema>;
export type OgSource = {
  hash: string;
  dataUrl: string;
  source: "upload" | "url" | "generated" | "city";
  sourceUrl?: string;
  prompt?: string;
  model?: string;
  cityId?: string;
  cityName?: string;
  revisionId?: string;
  approvalId?: string;
};
