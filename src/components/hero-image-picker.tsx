"use client";

import { useMemo, useState } from "react";

export default function HeroImagePicker({ cityName, onUrlChange }: { cityName: string; onUrlChange: (url: string) => void }) {
  const [mode, setMode] = useState<"url" | "upload" | "generate">("url");
  const prompt = useMemo(
    () => `Documentary-style wide hero image of ${cityName || "a local city"} at golden hour, people walking together, subtle Bitcoin-orange accents, no text, room for a logo overlay.`,
    [cityName],
  );

  return (
    <fieldset className="image-choice">
      <legend>Hero image</legend>
      <label><input type="radio" checked={mode === "url"} onChange={() => setMode("url")} /> Find or paste an image URL</label>
      <label><input type="radio" checked={mode === "upload"} onChange={() => setMode("upload")} /> Upload an image</label>
      <label><input type="radio" checked={mode === "generate"} onChange={() => setMode("generate")} /> Generate an image</label>
      {mode === "url" && <label>Image source URL <input name="heroImageUrl" type="url" onChange={(event) => onUrlChange(event.target.value)} required /></label>}
      {mode === "upload" && <p>Upload storage will be connected to the BitcoinWalk VPS before launch.</p>}
      {mode === "generate" && <><p>Suggested generation prompt:</p><textarea value={prompt} readOnly /><p>Image generation will be connected to the chosen image service before launch.</p></>}
      <p>The selected image will also be used to create the share preview with the BitcoinWalk logo overlay.</p>
    </fieldset>
  );
}
