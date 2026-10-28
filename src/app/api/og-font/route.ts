import { readFile } from "node:fs/promises";
import { join } from "node:path";

const font = readFile(
  join(
    process.cwd(),
    "design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf",
  ),
);

export async function GET() {
  return new Response(new Uint8Array(await font), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "font/ttf",
    },
  });
}
