import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {cityLogoVariants} from "./inkscape-source";
import {runLogoRenderer, validateGeneratedJobArtifact} from "./job-runner";
import type {LogoJob} from "./approval-worker";

const roots: string[] = [];
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const job: LogoJob = {
  jobKey: "a".repeat(64), cityId: "032d98ea-f5da-4826-95bd-c4cf9286716e", revisionId: "b".repeat(64), approvalId: "c".repeat(64), decisionAt: 1,
  cityName: "Warszawa", slug: "warszawa", locale: "pl-PL", templateVersion: "city-logo-inkscape-v1",
  state: "rendering", attempts: 1, nextAttemptAt: 1, leaseUntil: 2, leaseToken: "lease", lastError: null, artifactPath: null, createdAt: 1, updatedAt: 1,
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bw-logo-job-")); roots.push(root);
  const artifact = join(root, ".jobs", job.jobKey, job.slug); await mkdir(artifact, {recursive: true});
  const files = [];
  for (const variant of cityLogoVariants) {
    const name = `${job.slug}-${variant}.png`, data = Buffer.from(variant); await writeFile(join(artifact, name), data);
    files.push({name, label: variant, background: variant.endsWith("on-black") ? "dark" : "light", width: 100, height: 100, sha256: hash(data), transparent: true});
  }
  const archive = Buffer.from("zip fixture"); await writeFile(join(artifact, `${job.slug}-logos.zip`), archive);
  await writeFile(join(artifact, "manifest.json"), JSON.stringify({version: 1, cityId: job.cityId, slug: job.slug, cityName: job.cityName, locale: job.locale, source: "bitcoinwalk:city-logo-renderer", templateVersion: job.templateVersion, files, archive: {name: `${job.slug}-logos.zip`, sha256: hash(archive)}}));
  return {root, artifact};
}
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true}))));

describe("durable logo artifact runner", () => {
  it("validates and reuses a complete crash-recovered artifact", async () => {
    const {root, artifact} = await fixture(); const execute = vi.fn();
    await expect(runLogoRenderer(job, {renderer: "/home/bitcoinwalk/bin/render-city-logo-pack", assetRoot: root}, execute)).resolves.toBe(artifact);
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects identity and checksum tampering", async () => {
    const {artifact} = await fixture();
    const path = join(artifact, `${job.slug}-${cityLogoVariants[0]}.png`); await writeFile(path, "tampered");
    await expect(validateGeneratedJobArtifact(job, artifact)).rejects.toThrow("checksum");
  });
  it("rejects symlinked generated files", async () => {
    const {artifact} = await fixture();
    const path = join(artifact, `${job.slug}-${cityLogoVariants[0]}.png`); const target = `${path}.target`;
    const data = await readFile(path); await writeFile(target, data); await rm(path); await symlink(target, path);
    await expect(validateGeneratedJobArtifact(job, artifact)).rejects.toThrow("regular file");
  });
});
