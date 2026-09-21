import { writeFileSync } from "node:fs";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";

// Run once on the VPS, never in the browser. Refuse to replace an existing key.
const target = process.argv[2];
if (!target) throw new Error("Provide the new credential file path.");
process.umask(0o077);
const secret = generateSecretKey();
try {
  writeFileSync(target, Buffer.from(secret).toString("hex") + "\n", {flag:"wx",mode:0o600});
  console.log("BitcoinWalk Guide public identity:", nip19.npubEncode(getPublicKey(secret)));
  console.log("Private key saved to the credential file; it was not printed. Back it up securely on the server.");
} finally { secret.fill(0); }
