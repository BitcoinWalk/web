#!/usr/bin/env node
import process from "node:process";
import {renderCityLogoPack} from "../src/logos/city-logo-renderer.ts";

function usage(message) {
  if (message) console.error(message);
  console.error("Usage: node scripts/render-city-logo-pack.mjs --city-id UUID --city-name NAME --slug SLUG --locale LOCALE --output DIRECTORY");
  process.exit(2);
}

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) usage("Every option requires one value.");
  if (values.has(key)) usage(`Duplicate option: ${key}`);
  values.set(key, value);
}
const allowed = new Set(["--city-id", "--city-name", "--slug", "--locale", "--output"]);
for (const key of values.keys()) if (!allowed.has(key)) usage(`Unknown option: ${key}`);
for (const key of allowed) if (!values.get(key)) usage(`Missing option: ${key}`);

try {
  const manifest = await renderCityLogoPack({
    cityId: values.get("--city-id"),
    cityName: values.get("--city-name"),
    slug: values.get("--slug"),
    locale: values.get("--locale"),
  }, values.get("--output"));
  console.log(JSON.stringify({
    status: "accepted",
    cityId: manifest.cityId,
    slug: manifest.slug,
    templateVersion: manifest.templateVersion,
    files: manifest.files.length,
    archive: manifest.archive,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
