import { z } from "zod";

export const bitcoinWalkMarkIds = [
  "traditional",
  "primary-horizontal",
  "primary-horizontal-reversed",
  "avatar-orange",
  "avatar-ink",
  "avatar-reversed",
  "symbol-orange",
  "symbol-ink",
  "symbol-reversed",
  "horizontal",
  "horizontal-ink",
  "horizontal-reversed",
  "vertical",
  "vertical-ink",
  "vertical-reversed",
] as const;

export const bitcoinWalkMarkIdSchema = z.enum(bitcoinWalkMarkIds);
export type BitcoinWalkMarkId = z.infer<typeof bitcoinWalkMarkIdSchema>;

export const bitcoinWalkMarks: ReadonlyArray<{
  id: BitcoinWalkMarkId;
  label: string;
  use: string;
  path: string;
  preview: string;
  group: "featured" | "system";
  dark: boolean;
}> = [
  { id: "traditional", label: "Traditional mark", use: "Established orange roundel", path: "/brand/bitcoinwalk-icon.png", preview: "/brand/bitcoinwalk-icon.png", group: "featured", dark: false },
  { id: "primary-horizontal", label: "Primary wordmark", use: "Standard colour", path: "/brand/bitcoinwalk-horizontal.png", preview: "/brand/bitcoinwalk-horizontal.png", group: "featured", dark: false },
  { id: "primary-horizontal-reversed", label: "Reversed wordmark", use: "White artwork for dark backgrounds", path: "/brand/bitcoinwalk-horizontal-white.png", preview: "/brand/bitcoinwalk-horizontal-white.png", group: "featured", dark: true },
  { id: "avatar-orange", label: "Round symbol", use: "Orange roundel", path: "/brand/inkscape/global/bitcoinwalk-avatar-orange.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-avatar-orange.png", group: "system", dark: false },
  { id: "avatar-ink", label: "Round symbol", use: "Ink roundel", path: "/brand/inkscape/global/bitcoinwalk-avatar-ink.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-avatar-ink.png", group: "system", dark: false },
  { id: "avatar-reversed", label: "Round symbol", use: "Reversed on orange", path: "/brand/inkscape/global/bitcoinwalk-avatar-reversed.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-avatar-reversed.png", group: "system", dark: true },
  { id: "symbol-orange", label: "Standalone symbol", use: "Orange artwork", path: "/brand/inkscape/global/bitcoinwalk-symbol-orange.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-symbol-orange.png", group: "system", dark: false },
  { id: "symbol-ink", label: "Standalone symbol", use: "Ink artwork", path: "/brand/inkscape/global/bitcoinwalk-symbol-ink.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-symbol-ink.png", group: "system", dark: false },
  { id: "symbol-reversed", label: "Standalone symbol", use: "Reversed on orange", path: "/brand/inkscape/global/bitcoinwalk-symbol-reversed.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-symbol-reversed.png", group: "system", dark: true },
  { id: "horizontal", label: "Horizontal logo", use: "Standard colour", path: "/brand/inkscape/global/bitcoinwalk-horizontal.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-horizontal.png", group: "system", dark: false },
  { id: "horizontal-ink", label: "Horizontal logo", use: "Ink artwork", path: "/brand/inkscape/global/bitcoinwalk-horizontal-ink.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-horizontal-ink.png", group: "system", dark: false },
  { id: "horizontal-reversed", label: "Horizontal logo", use: "Reversed on orange", path: "/brand/inkscape/global/bitcoinwalk-horizontal-reversed.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-horizontal-reversed.png", group: "system", dark: true },
  { id: "vertical", label: "Vertical logo", use: "Standard colour", path: "/brand/inkscape/global/bitcoinwalk-vertical.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-vertical.png", group: "system", dark: false },
  { id: "vertical-ink", label: "Vertical logo", use: "Ink artwork", path: "/brand/inkscape/global/bitcoinwalk-vertical-ink.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-vertical-ink.png", group: "system", dark: false },
  { id: "vertical-reversed", label: "Vertical logo", use: "Reversed on orange", path: "/brand/inkscape/global/bitcoinwalk-vertical-reversed.png", preview: "/brand/inkscape/global/previews/bitcoinwalk-vertical-reversed.png", group: "system", dark: true },
];

export function bitcoinWalkMark(id: BitcoinWalkMarkId | undefined) {
  return bitcoinWalkMarks.find((mark) => mark.id === id) ?? bitcoinWalkMarks[0];
}
