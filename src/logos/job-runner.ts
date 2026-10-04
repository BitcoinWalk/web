import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {lstat, mkdir, readFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {promisify} from "node:util";
import {z} from "zod";
import {cityLogoVariants} from "./inkscape-source";
import type {LogoJob} from "./approval-worker";

const executeFile = promisify(execFile);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const logoManifestSchema = z.object({
  version: z.literal(1), cityId: z.uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  cityName: z.string().min(1).max(64), locale: z.string().min(2).max(35),
  source: z.literal("bitcoinwalk:city-logo-renderer"), templateVersion: z.enum(["city-logo-inkscape-v1", "city-logo-inkscape-v1.1", "city-logo-inkscape-v1.2"]),
  files: z.array(z.object({
    name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/), label: z.string(), background: z.enum(["light", "dark"]),
    width: z.number().int().positive().max(2000), height: z.number().int().positive().max(1000), sha256: digest, transparent: z.literal(true),
  }).strict()).length(cityLogoVariants.length),
  archive: z.object({name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-logos\.zip$/), sha256: digest}).strict(),
}).strict();
export type LogoManifest = z.infer<typeof logoManifestSchema>;

function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }

export async function validateGeneratedJobArtifact(job: LogoJob, artifactPath: string): Promise<void> {
  const manifest = logoManifestSchema.parse(JSON.parse(await readFile(join(artifactPath, "manifest.json"), "utf8")));
  if (manifest.cityId !== job.cityId || manifest.slug !== job.slug || manifest.cityName !== job.cityName || manifest.locale !== job.locale || manifest.templateVersion !== job.templateVersion) {
    throw new Error("Generated logo identity does not match its durable job");
  }
  const expected = new Set(cityLogoVariants.map(variant => `${job.slug}-${variant}.png`));
  if (new Set(manifest.files.map(file => file.name)).size !== expected.size || manifest.files.some(file => !expected.delete(file.name)) || expected.size) {
    throw new Error("Generated logo pack is incomplete");
  }
  for (const file of [...manifest.files, manifest.archive]) {
    const path = join(artifactPath, file.name);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 20_000_000) throw new Error("Generated logo artifact is not a bounded regular file");
    if (sha256(await readFile(path)) !== file.sha256) throw new Error("Generated logo checksum mismatch");
  }
}

export async function readGeneratedJobManifest(job: LogoJob, artifactPath: string): Promise<LogoManifest> {
  await validateGeneratedJobArtifact(job, artifactPath);
  return logoManifestSchema.parse(JSON.parse(await readFile(join(artifactPath, "manifest.json"), "utf8")));
}

export async function runLogoRenderer(
  job: LogoJob,
  configuration: {renderer: string; assetRoot: string},
  execute: typeof executeFile = executeFile,
): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(job.jobKey)) throw new Error("Invalid logo job key");
  const assetRoot = resolve(configuration.assetRoot);
  const output = join(assetRoot, ".jobs", job.jobKey);
  const artifact = join(output, job.slug);
  try {
    await validateGeneratedJobArtifact(job, artifact);
    return artifact;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(output, {recursive: true, mode: 0o750});
  await execute(configuration.renderer, [
    "--city-id", job.cityId, "--city-name", job.cityName, "--slug", job.slug,
    "--locale", job.locale, "--output", output,
  ], {timeout: 120_000, maxBuffer: 64 * 1024, windowsHide: true});
  await validateGeneratedJobArtifact(job, artifact);
  return artifact;
}
