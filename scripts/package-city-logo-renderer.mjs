#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "city-logo-inkscape-v1.2";
const output = join(root, "release-build");
await mkdir(output, {recursive: true});
const temporary = await mkdtemp(join(output, ".city-logo-renderer-"));

try {
  const stage = join(temporary, version);
  await mkdir(stage, {recursive: true});
  await build({
    entryPoints: [join(root, "scripts/render-city-logo-pack.mjs")],
    outfile: join(stage, "renderer.mjs"),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    external: ["sharp"],
    legalComments: "none",
  });
  await cp(join(root, "deploy/render-city-logo-pack"), join(stage, "bin/render-city-logo-pack"));
  await cp(join(root, "design/city-logo-templates/v1/fonts"), join(stage, "design/city-logo-templates/v1/fonts"), {recursive: true});
  await cp(join(root, "design/city-logo-templates/v1/examples/prototype-packs/szydlowiec"), join(stage, "design/city-logo-templates/v1/examples/prototype-packs/szydlowiec"), {recursive: true});
  await cp(join(root, "node_modules/sharp"), join(stage, "node_modules/sharp"), {recursive: true, verbatimSymlinks: true});
  await cp(join(root, "node_modules/@img"), join(stage, "node_modules/@img"), {recursive: true, verbatimSymlinks: true});
  await cp(join(root, "node_modules/detect-libc"), join(stage, "node_modules/detect-libc"), {recursive: true, verbatimSymlinks: true});
  await cp(join(root, "node_modules/semver"), join(stage, "node_modules/semver"), {recursive: true, verbatimSymlinks: true});
  await writeFile(join(stage, "VERSION"), `${version}\n`);

  const archive = join(output, `bitcoinwalk-city-logo-renderer-${version}.tar.gz`);
  execFileSync("tar", ["--sort=name", "--mtime=1980-01-01 UTC", "--owner=0", "--group=0", "--numeric-owner", "-czf", archive, "-C", temporary, version]);
  execFileSync("tar", ["-tzf", archive], {stdio: "ignore"});
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
  await writeFile(`${archive}.sha256`, `${digest}  ${archive.split("/").at(-1)}\n`);
  console.log(`Packaged ${archive}`);
  console.log(`SHA-256 ${digest}`);
} finally {
  await rm(temporary, {recursive: true, force: true});
}
