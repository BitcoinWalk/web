import { readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SimplePool, finalizeEvent, type Event } from "nostr-tools";
import { configSchema, assertBotKey, selectInbox, guideProfile, signTransportAuth } from "./core";
import { Outbox } from "./outbox";
import { history, readComplete } from "./transport";
import { SUPER_ADMIN_PUBKEY } from "../nostr/authority";
import { parseCityRevision, parseApprovalRecord, pendingCityRevisions, type CityRevision, type ApprovalRecord } from "../nostr/city-records";

async function main() {
  process.umask(0o077);
  const configPath = process.env.GUIDE_CONFIG;
  if (!configPath) throw new Error("Set GUIDE_CONFIG to the reviewed configuration path.");
  const config = configSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
  const dryRun = process.argv.includes("--dry-run");
  const publishProfile = process.argv.includes("--publish-profile");
  if (!dryRun && !publishProfile && !config.enabled) throw new Error("Guide is disabled. Complete dry-run and operator review before enabling.");
  let secret: Uint8Array | undefined;
  let outbox: Outbox | undefined;
  if (!dryRun) {
    const credentials = process.env.CREDENTIALS_DIRECTORY;
    const state = process.env.STATE_DIRECTORY;
    if (!credentials || !state) throw new Error("Use the dedicated systemd credential and state directories.");
    const path = join(credentials, "guide-key");
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o027) !== 0 || stat.size > 66) throw new Error("Guide credential must be a private regular hex-key file.");
    const raw = readFileSync(path, "utf8").trim();
    if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error("Invalid Guide credential format.");
    secret = Uint8Array.from(Buffer.from(raw, "hex"));
    const bot = assertBotKey(secret, config.recipients);
    outbox = new Outbox(join(state, "guide.sqlite"));
    outbox.bind(bot, config.sourceRelay);
    console.log("BitcoinWalk Guide notification worker started; bot public key:", bot);
  }
  const pool = new SimplePool({ enableReconnect: false });
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  try {
    if (publishProfile && !dryRun) {
      await Promise.any(pool.publish(config.discoveryRelays, finalizeEvent({kind:0,created_at:Math.floor(Date.now()/1000),tags:[],content:JSON.stringify(guideProfile)}, secret!), {maxWait:10_000}));
      console.log("BitcoinWalk Guide public bot profile acknowledged. No NIP-05 claim or DM was published.");
      return;
    }
    do {
      try {
        // Re-read retained history: event timestamps are author-controlled, not an ingestion cursor.
        const revisionEvents = await history(pool, config.sourceRelay, 30303);
        const decisionEvents = await history(pool, config.sourceRelay, 30304, SUPER_ADMIN_PUBKEY);
        const revisions = revisionEvents.map(parseCityRevision).filter((r): r is CityRevision => r !== null);
        const decisions = decisionEvents.map(parseApprovalRecord).filter((r): r is ApprovalRecord => r !== null);
        const pending = pendingCityRevisions(revisions, decisions);
        if (dryRun) {
          for (const recipient of config.recipients) {
            const lists = await readComplete(pool, config.discoveryRelays, { kinds: [10050], authors: [recipient], limit: 10 });
            selectInbox(lists, recipient, config.allowedInboxRelays);
          }
          console.log(`Dry run passed: ${pending.length} pending revisions; all recipient inboxes verified. No key loaded, messages sent or baseline written.`);
          return;
        }
        const queued = outbox!.ingest(revisionEvents, pending, config.recipients, secret!, config.adminURL);
        console.log(`Scan complete; ${queued} new recipient notification(s) queued.`);
        const pendingIDs = new Set(pending.map(r => r.event.id));
        for (const row of outbox!.due(Math.floor(Date.now()/1000))) {
          if (stopping) break;
          if (!config.recipients.includes(row.recipient)) { outbox!.state(row, "removed-recipient"); continue; }
          if (!pendingIDs.has(row.submission)) { outbox!.state(row, "obsolete"); continue; }
          try {
            // Recheck decisions immediately before sending delayed work.
            const fresh = (await history(pool, config.sourceRelay, 30304, SUPER_ADMIN_PUBKEY)).map(parseApprovalRecord).filter((r): r is ApprovalRecord => r !== null);
            if (!pendingCityRevisions(revisions, fresh).some(r => r.event.id === row.submission)) { outbox!.state(row, "obsolete"); continue; }
            const lists = await readComplete(pool, config.discoveryRelays, { kinds: [10050], authors: [row.recipient], limit: 10 });
            const relays = selectInbox(lists, row.recipient, config.allowedInboxRelays);
            const wrapped: Event = JSON.parse(row.wrapped);
            // Retries reuse the exact persisted gift-wrap ID, including after an uncertain acknowledgement.
            await Promise.any(pool.publish(relays, wrapped, { maxWait: 10_000, onauth: async template => signTransportAuth(template, secret!, relays) }));
            outbox!.state(row, "acknowledged");
            console.log("Notification acknowledged by an inbox relay (not proof of reading).");
          } catch {
            outbox!.retry(row, Math.floor(Date.now()/1000));
            console.error("Notification deferred: inbox discovery or publication failed. Exact event retained for retry.");
          }
        }
      } catch {
        if (dryRun) throw new Error("Dry run failed: verify source reads, recipient NIP-17 inbox settings and allowed relay configuration.");
        console.error("Guide scan failed; no cursor advanced. Will retry. Check relay availability and configured read limits.");
      }
      for (let i = 0; i < 60 && !stopping; i++) await delay(1000);
    } while (!stopping);
  } finally { pool.destroy(); outbox?.close(); secret?.fill(0); }
}
main().catch(() => { console.error("Guide stopped. Check the configuration, credential permissions and state identity; no secret values are logged."); process.exitCode = 1; });
