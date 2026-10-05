import {createHash, randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {pendingCityRevisions,type ApprovalRecord,type CityRevision} from "../nostr/city-records";
import {managedCities} from "../nostr/moderation";
import {cityLogoTemplateVersion} from "./city-logo-renderer";

const maxAttempts = 8;
export type LogoApprovalSnapshot = {revisions: CityRevision[]; approvals: ApprovalRecord[]};
export type LogoCandidate = {
  jobKey: string; cityId: string; revisionId: string; approvalId: string; decisionAt: number;
  cityName: string; slug: string; locale: string; templateVersion: string;
};
export type LogoJobState = "queued" | "rendering" | "failed" | "ready" | "obsolete";
export type LogoJob = LogoCandidate & {
  state: LogoJobState; attempts: number; nextAttemptAt: number; leaseUntil: number | null;
  leaseToken: string | null; lastError: string | null; artifactPath: string | null;
  createdAt: number; updatedAt: number;
};

function keyFor(candidate: Omit<LogoCandidate, "jobKey" | "approvalId" | "decisionAt">): string {
  return createHash("sha256").update(JSON.stringify([
    candidate.cityId, candidate.revisionId, candidate.cityName.normalize("NFC"), candidate.locale, candidate.templateVersion,
  ])).digest("hex");
}

export function approvedLogoCandidates(snapshot: LogoApprovalSnapshot): LogoCandidate[] {
  return managedCities(snapshot.revisions, snapshot.approvals).filter(row => row.state === "approved").map(row => {
    const city = row.revision.city;
    const candidate = {
      cityId: city.cityId,
      revisionId: row.revision.event.id,
      approvalId: row.decision.event.id,
      decisionAt: row.decision.event.created_at,
      cityName: city.cityName.normalize("NFC"),
      slug: row.decision.approval.slug ?? city.slug,
      locale: city.locale ?? "und",
      templateVersion: cityLogoTemplateVersion,
    };
    return {...candidate, jobKey: keyFor(candidate)};
  });
}

export function pendingLogoCandidate(snapshot:LogoApprovalSnapshot,cityId:string,revisionId:string,slug:string):LogoCandidate|null{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;
  const revision=pendingCityRevisions(snapshot.revisions,snapshot.approvals).find(row=>row.event.id===revisionId&&row.city.cityId===cityId);
  if(!revision||revision.event.tags.some(tag=>tag[0]==="e"&&tag[3]==="previous"))return null;
  const candidate={cityId,revisionId,approvalId:"0".repeat(64),decisionAt:0,cityName:revision.city.cityName.normalize("NFC"),slug,locale:revision.city.locale??"und",templateVersion:cityLogoTemplateVersion};
  return {...candidate,jobKey:keyFor(candidate)};
}

export class LogoJobStore {
  readonly db: DatabaseSync;
  constructor(database: DatabaseSync, activatedAt = Math.floor(Date.now() / 1000)) {
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS city_logo_runtime(id INTEGER PRIMARY KEY CHECK(id=1),activatedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS city_logo_job(
        jobKey TEXT PRIMARY KEY,cityId TEXT NOT NULL,revisionId TEXT NOT NULL,approvalId TEXT NOT NULL,decisionAt INTEGER NOT NULL,
        cityName TEXT NOT NULL,slug TEXT NOT NULL,locale TEXT NOT NULL,templateVersion TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('queued','rendering','failed','ready','obsolete')),
        attempts INTEGER NOT NULL DEFAULT 0,nextAttemptAt INTEGER NOT NULL,leaseUntil INTEGER,leaseToken TEXT,lastError TEXT,artifactPath TEXT,
        createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS city_logo_job_work ON city_logo_job(state,nextAttemptAt,createdAt);
      CREATE INDEX IF NOT EXISTS city_logo_job_city ON city_logo_job(cityId,updatedAt);
    `);
    this.db.prepare("INSERT OR IGNORE INTO city_logo_runtime(id,activatedAt) VALUES(1,?)").run(activatedAt);
  }
  activatedAt(): number { return (this.db.prepare("SELECT activatedAt FROM city_logo_runtime WHERE id=1").get() as {activatedAt: number}).activatedAt; }
  rows(): LogoJob[] { return this.db.prepare("SELECT * FROM city_logo_job ORDER BY createdAt,jobKey").all() as LogoJob[]; }
  get(jobKey: string): LogoJob | null { return (this.db.prepare("SELECT * FROM city_logo_job WHERE jobKey=?").get(jobKey) as LogoJob | undefined) ?? null; }

  reconcile(candidates: LogoCandidate[], now: number): void {
    const current = new Map(candidates.map(candidate => [candidate.cityId, candidate]));
    const eligible = candidates;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of this.rows()) {
        if (current.get(row.cityId)?.jobKey !== row.jobKey && row.state !== "obsolete") {
          this.db.prepare("UPDATE city_logo_job SET state='obsolete',leaseUntil=NULL,leaseToken=NULL,updatedAt=? WHERE jobKey=?").run(now, row.jobKey);
        }
      }
      for (const candidate of eligible) {
        this.db.prepare(`INSERT OR IGNORE INTO city_logo_job(
          jobKey,cityId,revisionId,approvalId,decisionAt,cityName,slug,locale,templateVersion,state,nextAttemptAt,createdAt,updatedAt
        ) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?,?)`).run(
          candidate.jobKey,candidate.cityId,candidate.revisionId,candidate.approvalId,candidate.decisionAt,candidate.cityName,candidate.slug,candidate.locale,candidate.templateVersion,now,now,now,
        );
        this.db.prepare(`UPDATE city_logo_job SET approvalId=?,decisionAt=?,cityName=?,slug=?,locale=?,updatedAt=?,
          state=CASE WHEN state='obsolete' AND artifactPath IS NOT NULL THEN 'ready' WHEN state='obsolete' THEN 'queued' ELSE state END,
          nextAttemptAt=CASE WHEN state='obsolete' THEN ? ELSE nextAttemptAt END,lastError=CASE WHEN state='obsolete' THEN NULL ELSE lastError END
          WHERE jobKey=?`).run(candidate.approvalId,candidate.decisionAt,candidate.cityName,candidate.slug,candidate.locale,now,now,candidate.jobKey);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  recoverExpired(now: number): void {
    this.db.prepare("UPDATE city_logo_job SET state='queued',leaseUntil=NULL,leaseToken=NULL,nextAttemptAt=?,lastError='lease-expired',updatedAt=? WHERE state='rendering' AND leaseUntil<?").run(now,now,now);
  }
  claim(now: number, leaseSeconds: number): LogoJob | null {
    this.recoverExpired(now);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT jobKey FROM city_logo_job WHERE state IN ('queued','failed') AND nextAttemptAt<=? AND attempts<? ORDER BY nextAttemptAt,createdAt LIMIT 1").get(now,maxAttempts) as {jobKey: string} | undefined;
      if (!row) { this.db.exec("COMMIT"); return null; }
      const token = randomUUID();
      this.db.prepare("UPDATE city_logo_job SET state='rendering',attempts=attempts+1,leaseUntil=?,leaseToken=?,lastError=NULL,updatedAt=? WHERE jobKey=?").run(now+leaseSeconds,token,now,row.jobKey);
      this.db.exec("COMMIT");
      return this.get(row.jobKey);
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  recordArtifact(jobKey: string, leaseToken: string, artifactPath: string, now: number): void {
    const result=this.db.prepare("UPDATE city_logo_job SET artifactPath=?,updatedAt=? WHERE jobKey=? AND state='rendering' AND leaseToken=?").run(artifactPath,now,jobKey,leaseToken);
    if(result.changes!==1)throw new Error("Logo job lease was lost");
  }
  complete(jobKey: string, leaseToken: string, now: number): void {
    const result=this.db.prepare("UPDATE city_logo_job SET state='ready',leaseUntil=NULL,leaseToken=NULL,lastError=NULL,updatedAt=? WHERE jobKey=? AND state='rendering' AND leaseToken=?").run(now,jobKey,leaseToken);
    if(result.changes!==1)throw new Error("Logo job lease was lost");
  }
  obsolete(jobKey: string, leaseToken: string, now: number, artifactPath?: string): void {
    const result=this.db.prepare("UPDATE city_logo_job SET state='obsolete',artifactPath=COALESCE(?,artifactPath),leaseUntil=NULL,leaseToken=NULL,lastError=NULL,updatedAt=? WHERE jobKey=? AND state='rendering' AND leaseToken=?").run(artifactPath??null,now,jobKey,leaseToken);
    if(result.changes!==1)throw new Error("Logo job lease was lost");
  }
  fail(jobKey: string, leaseToken: string, safeError: string, now: number): void {
    const row=this.get(jobKey);if(!row||row.leaseToken!==leaseToken||row.state!=="rendering")throw new Error("Logo job lease was lost");
    const delay=Math.min(3600,60*2**Math.max(0,row.attempts-1));
    this.db.prepare("UPDATE city_logo_job SET state='failed',nextAttemptAt=?,leaseUntil=NULL,leaseToken=NULL,lastError=?,updatedAt=? WHERE jobKey=? AND leaseToken=?").run(now+delay,safeError.slice(0,100),now,jobKey,leaseToken);
  }
}

export class LogoJobService {
  private busy = false;
  constructor(
    readonly store: LogoJobStore,
    private readSnapshot: () => Promise<LogoApprovalSnapshot>,
    private render: (job: LogoJob) => Promise<string>,
    private now = () => Math.floor(Date.now() / 1000),
  ) {}
  async reconcile(): Promise<void> {
    const snapshot = await this.readSnapshot();
    this.store.reconcile(approvedLogoCandidates(snapshot), this.now());
  }
  async preparePending(cityId:string,revisionId:string,slug:string):Promise<LogoCandidate>{
    if(this.busy)throw new Error("Logo generation is busy. Try again shortly.");
    this.busy=true;
    try{
      const candidate=pendingLogoCandidate(await this.readSnapshot(),cityId,revisionId,slug);
      if(!candidate)throw new Error("The pending new-city revision could not be verified.");
      const now=this.now(),job:LogoJob={...candidate,state:"rendering",attempts:1,nextAttemptAt:now,leaseUntil:now+300,leaseToken:"preview",lastError:null,artifactPath:null,createdAt:now,updatedAt:now};
      await this.render(job);
      const after=pendingLogoCandidate(await this.readSnapshot(),cityId,revisionId,slug);
      if(after?.jobKey!==candidate.jobKey)throw new Error("The city request changed while its logos were generated. Refresh and retry.");
      return candidate;
    }finally{this.busy=false;}
  }
  async runOne(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const job = this.store.claim(this.now(), 300);
    if (!job?.leaseToken) { this.busy = false; return false; }
    let artifactPath: string | undefined;
    try {
      const before = approvedLogoCandidates(await this.readSnapshot()).find(candidate => candidate.jobKey === job.jobKey);
      if (!before) { this.store.obsolete(job.jobKey, job.leaseToken, this.now()); return true; }
      artifactPath = await this.render(job);
      this.store.recordArtifact(job.jobKey, job.leaseToken, artifactPath, this.now());
      const after = approvedLogoCandidates(await this.readSnapshot()).find(candidate => candidate.jobKey === job.jobKey);
      if (!after) this.store.obsolete(job.jobKey, job.leaseToken, this.now(), artifactPath);
      else this.store.complete(job.jobKey, job.leaseToken, this.now());
      return true;
    } catch {
      this.store.fail(job.jobKey, job.leaseToken, artifactPath ? "approval-recheck-failed" : "render-or-approval-check-failed", this.now());
      return true;
    } finally { this.busy = false; }
  }
  async tick(): Promise<void> {
    await this.reconcile();
    for (let completed = 0; completed < 10; completed += 1) if (!await this.runOne()) break;
  }
}
