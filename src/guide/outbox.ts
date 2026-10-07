import { DatabaseSync } from "node:sqlite";
import type { ApprovalRecord, CityRevision } from "../nostr/city-records";
import type { Event } from "nostr-tools";
import { approvalAlert, directoryAlert, liveAlert, replicationAlert, wrapAlert } from "./core";
import type {GuideDirectoryRequest} from "./directory";

export type Delivery = { submission: string; recipient: string; wrapped: string; attempts: number; next_attempt: number; state: string; purpose: "review" | "live" | "replication-degraded" | "replication-recovered"|"directory-invitation"|"directory-active"|"directory-failed" };
export type ReplicationCityStatus={cityId:string;destination:string;state:"healthy"|"pending"|"degraded";counts:Record<string,number>};
export type ReplicationRecipient={recipient:string;cityName:string};
export type LivePublication = { revision: CityRevision; approval: ApprovalRecord; event: Event };
export class Outbox {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS delivery (submission TEXT NOT NULL, recipient TEXT NOT NULL, wrapped TEXT NOT NULL,
        sender_copy TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'pending', purpose TEXT NOT NULL DEFAULT 'review', PRIMARY KEY(submission, recipient));`);
    const columns = this.db.prepare("PRAGMA table_info(delivery)").all() as Array<{name:string}>;
    if (!columns.some(column => column.name === "purpose")) this.db.exec("ALTER TABLE delivery ADD COLUMN purpose TEXT NOT NULL DEFAULT 'review'");
    this.db.exec("CREATE TABLE IF NOT EXISTS live_seen (id TEXT PRIMARY KEY)");
    this.db.exec("CREATE TABLE IF NOT EXISTS replication_state (city_id TEXT PRIMARY KEY, state TEXT NOT NULL, recipient TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0)");
    this.db.exec("CREATE TABLE IF NOT EXISTS directory_state (request_id TEXT PRIMARY KEY, state TEXT NOT NULL, recipient TEXT NOT NULL)");
  }
  ingestDirectory(requests:GuideDirectoryRequest[],secret:Uint8Array,adminURL:string):number{
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const initialized=!!this.db.prepare("SELECT value FROM meta WHERE key='directory-initialized'").get();let queued=0;
      for(const request of requests){
        const state=`${request.status}:${request.activationState}`,previous=this.db.prepare("SELECT state,recipient FROM directory_state WHERE request_id=?").get(request.id) as {state:string;recipient:string}|undefined;
        let purpose:"directory-invitation"|"directory-active"|"directory-failed"|undefined;
        if(initialized&&!previous&&request.status==="awaiting-owner")purpose="directory-invitation";
        else if(previous&&previous.state!==state&&request.activationState==="active")purpose="directory-active";
        else if(previous&&previous.state!==state&&request.activationState==="failed")purpose="directory-failed";
        if(purpose){const wraps=wrapAlert(directoryAlert(purpose,request.cityName,request.id,adminURL),request.ownerPubkey,secret);this.db.prepare("INSERT OR IGNORE INTO delivery (submission,recipient,wrapped,sender_copy,purpose) VALUES (?,?,?,?,?)").run(`directory:${request.id}:${purpose}`,request.ownerPubkey,JSON.stringify(wraps.recipient),JSON.stringify(wraps.sender),purpose);queued++;}
        this.db.prepare("INSERT INTO directory_state(request_id,state,recipient) VALUES(?,?,?) ON CONFLICT(request_id) DO UPDATE SET state=excluded.state,recipient=excluded.recipient").run(request.id,state,request.ownerPubkey);
      }
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('directory-initialized','1')").run();this.db.exec("COMMIT");return queued;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  ingestLive(publications: LivePublication[], secret: Uint8Array, adminURL: string, relay: string): number {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const initialized = !!this.db.prepare("SELECT value FROM meta WHERE key='live-initialized'").get();
      let queued = 0;
      if (initialized) for (const publication of publications) {
        const approvalID = publication.approval.event.id;
        if (this.db.prepare("SELECT id FROM live_seen WHERE id=?").get(approvalID)) continue;
        const recipient = publication.revision.event.pubkey;
        const wraps = wrapAlert(liveAlert(publication.revision, publication.event, adminURL, relay), recipient, secret);
        this.db.prepare("INSERT OR IGNORE INTO delivery (submission,recipient,wrapped,sender_copy,purpose) VALUES (?,?,?,?, 'live')")
          .run(`live:${approvalID}`, recipient, JSON.stringify(wraps.recipient), JSON.stringify(wraps.sender));
        queued++;
      }
      for (const publication of publications) this.db.prepare("INSERT OR IGNORE INTO live_seen VALUES (?)").run(publication.approval.event.id);
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('live-initialized','1')").run();
      this.db.exec("COMMIT"); return queued;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  ingestReplication(cities:ReplicationCityStatus[],organizers:Map<string,ReplicationRecipient>,secret:Uint8Array):number {
    this.db.exec("BEGIN IMMEDIATE");
    try{
      let queued=0;
      for(const city of cities){
        const organizer=organizers.get(city.cityId);if(!organizer)continue;
        const previous=this.db.prepare("SELECT state,recipient,generation FROM replication_state WHERE city_id=?").get(city.cityId) as {state:string;recipient:string;generation:number}|undefined;
        const next=city.state==="degraded"?"degraded":city.state==="healthy"?"healthy":previous?.state??"healthy";
        if(!previous){this.db.prepare("INSERT INTO replication_state (city_id,state,recipient,generation) VALUES (?,?,?,0)").run(city.cityId,next,organizer.recipient);continue;}
        if(previous.state===next){this.db.prepare("UPDATE replication_state SET recipient=? WHERE city_id=?").run(organizer.recipient,city.cityId);continue;}
        const generation=previous.generation+1,purpose=next==="degraded"?"replication-degraded":"replication-recovered";
        const wraps=wrapAlert(replicationAlert(next==="degraded"?"degraded":"recovered",organizer.cityName,city.cityId),organizer.recipient,secret);
        this.db.prepare("INSERT OR IGNORE INTO delivery (submission,recipient,wrapped,sender_copy,purpose) VALUES (?,?,?,?,?)")
          .run(`replication:${city.cityId}:${generation}:${next}`,organizer.recipient,JSON.stringify(wraps.recipient),JSON.stringify(wraps.sender),purpose);
        this.db.prepare("UPDATE replication_state SET state=?,recipient=?,generation=? WHERE city_id=?").run(next,organizer.recipient,generation,city.cityId);queued++;
      }
      this.db.exec("COMMIT");return queued;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
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
