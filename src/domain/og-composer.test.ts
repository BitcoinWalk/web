import { describe, expect, it } from "vitest";
import { ogCompositionSchema } from "./og-composer";

const composition = {
  version: 1 as const,
  title: "Sizing controls",
  background: {
    hash: "a".repeat(64),
    source: "upload" as const,
    zoom: 1,
    x: 50,
    y: 50,
  },
  mark: {
    visible: true,
    variant: "traditional" as const,
    x: 0,
    y: 0,
    width: 900,
    align: "center" as const,
    verticalAlign: "center" as const,
  },
  text: {
    value: "Large text",
    x: 0,
    y: 0,
    width: 1120,
    fontSize: 180,
    align: "left" as const,
    color: "#ffffff" as const,
    treatment: "shadow" as const,
  },
  logo: {
    hash: "b".repeat(64),
    source: "upload" as const,
    x: 0,
    y: 0,
    width: 900,
    align: "right" as const,
    verticalAlign: "bottom" as const,
  },
};

describe("OG composer sizing", () => {
  it("accepts the enlarged UI limits and rejects oversized text", () => {
    expect(ogCompositionSchema.parse(composition).text.fontSize).toBe(180);
    expect(ogCompositionSchema.parse(composition).mark.align).toBe("center");
    expect(() =>
      ogCompositionSchema.parse({
        ...composition,
        text: { ...composition.text, fontSize: 181 },
      }),
    ).toThrow();
  });
});
