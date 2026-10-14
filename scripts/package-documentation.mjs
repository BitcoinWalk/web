import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const version = "0.1.0";
const output = path.join(root, "release-build", `bitcoinwalk-documentation-${version}`);
const siteSource = path.join(root, "documentation", "dist");
const deployFiles = [
  "Caddyfile.documentation",
  `install-documentation-${version}.sh`,
];

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unsupported package entry: ${relative}`);
    }
  }
  return files;
}

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "deploy"), { recursive: true });
await cp(siteSource, path.join(output, "site"), { recursive: true, errorOnExist: true });
for (const file of deployFiles) {
  await cp(path.join(root, "deploy", file), path.join(output, "deploy", file));
}

const files = await filesUnder(output);
const lines = [];
for (const relative of files) {
  const digest = createHash("sha256")
    .update(await readFile(path.join(output, relative)))
    .digest("hex");
  lines.push(`${digest}  ${relative}`);
}
await writeFile(path.join(output, "SHA256SUMS"), `${lines.join("\n")}\n`);
console.log(output);
