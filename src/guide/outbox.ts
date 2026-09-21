import { DatabaseSync } from "node:sqlite";
import type { CityRevision } from "../nostr/city-records";
import type { Event } from "nostr-tools";
import { approvalAlert, wrapAlert } from "./core";

export type Delivery = { submission: string; recipient: string; wrapped: string; attempts: number; next_attempt: number; state: string };
export class Outbox {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS delivery (submission TEXT NOT NULL, recipient TEXT NOT NULL, wrapped TEXT NOT NULL,
        sender_copy TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(submission, recipient));`);
  }
  bind(bot: string, source: string) {
    const identity = JSON.stringify([bot, source]);
    const old = this.db.prepare("SELECT value FROM meta WHERE key='identity'").get() as { value: string } | undefined;
    if (old && old.value !== identity) throw new Error("Outbox belongs to another bot or relay; migration requires operator review.");
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('identity', ?)").run(identity);
  }
  ingest(all: Event[], pending: CityRevision[], recipients: string[], secret: Uint8Array, adminURL: string): number {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const initialized = !!this.db.prepare("SELECT value FROM meta WHERE key='initialized'").get();
      let queued = 0;
      // First successful scan baselines existing records: no surprise historical DM flood.
      if (initialized) for (const revision of pending) {
        if (this.db.prepare("SELECT id FROM seen WHERE id=?").get(revision.event.id)) continue;
        for (const recipient of new Set(recipients)) {
          const wraps = wrapAlert(approvalAlert(revision, adminURL), recipient, secret);
          this.db.prepare("INSERT OR IGNORE INTO delivery (submission,recipient,wrapped,sender_copy) VALUES (?,?,?,?)")
            .run(revision.event.id, recipient, JSON.stringify(wraps.recipient), JSON.stringify(wraps.sender));
          queued++;
        }
      }
      for (const event of all) this.db.prepare("INSERT OR IGNORE INTO seen VALUES (?)").run(event.id);
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('initialized','1')").run();
      this.db.exec("COMMIT"); return queued;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  due(now: number): Delivery[] {
    return this.db.prepare("SELECT * FROM delivery WHERE state='pending' AND next_attempt<=? ORDER BY next_attempt LIMIT 20").all(now) as Delivery[];
  }
  state(row: Delivery, state: "acknowledged" | "obsolete" | "removed-recipient") {
    this.db.prepare("UPDATE delivery SET state=? WHERE submission=? AND recipient=?").run(state, row.submission, row.recipient);
  }
  retry(row: Delivery, now: number) {
    const delay = Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7));
    this.db.prepare("UPDATE delivery SET attempts=attempts+1,next_attempt=? WHERE submission=? AND recipient=?")
      .run(now + delay, row.submission, row.recipient);
  }
  close() { this.db.close(); }
}
