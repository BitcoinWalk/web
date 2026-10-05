import {createHash} from "node:crypto";
import {DOMParser, XMLSerializer} from "@xmldom/xmldom";
import sharp from "sharp";

export const MAX_SPONSOR_LOGO_BYTES = 5 * 1024 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";
const elements = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "title", "desc"]);
const attributes = new Set(["xmlns", "width", "height", "viewBox", "preserveAspectRatio", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "transform"]);

/** Re-serialize a narrow, resource-free SVG subset, never pass raw XML to Sharp. */
export function validateSponsorSvg(bytes: Buffer): Buffer {
  if (bytes.length > 512 * 1024) throw new Error("SVG logos must be 512 KB or smaller.");
  const source = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY|<\?|<!\[CDATA\[/i.test(source.replace(/^\s*<\?xml\s[^?]*\?>/, ""))) {
    throw new Error("SVG declarations and processing instructions are not supported.");
  }
  const document = new DOMParser({onError: () => {throw new Error("Invalid SVG XML.");}}).parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.tagName !== "svg" || root.namespaceURI !== SVG_NS) throw new Error("Use a standard SVG document.");
  let count = 0;
  function visit(node: NonNullable<typeof root>, depth: number) {
    if (++count > 2000 || depth > 24) throw new Error("SVG logo is too complex.");
    if (node.namespaceURI !== SVG_NS || !elements.has(node.tagName)) throw new Error("SVG supports outlined shapes only; remove text, styles, images and effects.");
    for (let index = 0; index < node.attributes.length; index++) {
      const attr = node.attributes.item(index)!;
      if (!attributes.has(attr.name) || attr.value.length > 65536) throw new Error(`Unsupported SVG attribute: ${attr.name}`);
      if (attr.name === "xmlns") {if (attr.value !== SVG_NS) throw new Error("Invalid SVG namespace."); continue;}
      if (/[&<>]|url\s*\(|[\u0000-\u001f]/i.test(attr.value)) throw new Error("SVG resources are not supported.");
      if ((attr.name === "fill" || attr.name === "stroke") && !/^(?:none|transparent|black|white|#[a-f\d]{3,8}|rgb\([\d.,%\s]+\))$/i.test(attr.value)) throw new Error("Use explicit RGB or hex SVG colours.");
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1) visit(child as NonNullable<typeof root>, depth + 1);
      else if (child.nodeType === 3 && child.nodeValue?.trim() && !["title", "desc"].includes(node.tagName)) throw new Error("Convert SVG text to paths.");
      else if (![3, 8].includes(child.nodeType)) throw new Error("Unsupported SVG node.");
    }
  }
  visit(root, 0);
  return Buffer.from(new XMLSerializer().serializeToString(root));
}

export async function normalizeSponsorLogo(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_SPONSOR_LOGO_BYTES) throw new Error("Logo must be between 1 byte and 5 MB.");
  if (!["image/png", "image/webp", "image/svg+xml"].includes(mime)) throw new Error("Upload PNG, WebP or SVG. JPEG is not accepted.");
  const input = mime === "image/svg+xml" ? validateSponsorSvg(bytes) : bytes;
  const image = sharp(input, {limitInputPixels: 16_000_000, failOn: "warning"}).timeout({seconds: 5});
  const info = await image.metadata();
  const expected = mime === "image/svg+xml" ? "svg" : mime === "image/png" ? "png" : "webp";
  if (info.format !== expected || (info.pages ?? 1) !== 1) throw new Error("File contents must match the selected format; animation is not accepted.");
  if (!info.width || !info.height || info.width < 32 || info.height < 32 || info.width > 8192 || info.height > 8192) throw new Error("Logo dimensions must be between 32 and 8192 pixels.");
  const body = await image.rotate().resize(1024, 1024, {fit: "inside", withoutEnlargement: true}).toColourspace("srgb").png().toBuffer();
  const hash = createHash("sha256").update(body).digest("hex");
  return {body, hash, originalHash: createHash("sha256").update(bytes).digest("hex")};
}
