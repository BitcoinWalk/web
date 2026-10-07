import type {DatabaseSync} from "node:sqlite";

export type ProSetupTask = {
  cityId: string;
  state: "setup-required" | "payout-confirmed" | "signer-confirmed" | "ready-for-proof";
  registrationVersion?: number;
  payoutVersion?: number;
  signer?: {pubkey: string; version: number; confirmedAt: number};
  artwork?: {revisionId: string; avatar: string; banner: string; version: number};
  createdAt: number;
  updatedAt: number;
};

type TaskRow = {
  cityId: string;
  entitlementId: string;
  originalOwnerPubkey: string;
  currentOwnerPubkey: string;
  registrationVersion: number | null;
  payoutVersion: number | null;
  brandPubkey: string | null;
  brandVersion: number;
  backupAcknowledgedAt: number | null;
  artworkRevisionId: string | null;
  artworkAvatar: string | null;
  artworkBanner: string | null;
  artworkVersion: number;
  state: ProSetupTask["state"];
  createdAt: number;
  updatedAt: number;
};

/** Private, durable recovery state. It never contains a signer secret or payout destination. */
export class ProSetupTaskStore {
  constructor(readonly db: DatabaseSync) {
    this.db.exec(`CREATE TABLE IF NOT EXISTS pro_setup_task(
      cityId TEXT PRIMARY KEY,
      entitlementId TEXT NOT NULL UNIQUE,
      originalOwnerPubkey TEXT NOT NULL,
      currentOwnerPubkey TEXT NOT NULL,
      registrationVersion INTEGER,
      payoutVersion INTEGER,
      brandPubkey TEXT,
      brandVersion INTEGER NOT NULL DEFAULT 0,
      backupAcknowledgedAt INTEGER,
      artworkRevisionId TEXT,
      artworkAvatar TEXT,
      artworkBanner TEXT,
      artworkVersion INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );`);
    const columns = new Set((this.db.prepare("PRAGMA table_info(pro_setup_task)").all() as {name: string}[]).map(row => row.name));
    if (!columns.has("brandPubkey")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN brandPubkey TEXT");
    if (!columns.has("brandVersion")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN brandVersion INTEGER NOT NULL DEFAULT 0");
    if (!columns.has("backupAcknowledgedAt")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN backupAcknowledgedAt INTEGER");
    if (!columns.has("artworkRevisionId")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN artworkRevisionId TEXT");
    if (!columns.has("artworkAvatar")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN artworkAvatar TEXT");
    if (!columns.has("artworkBanner")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN artworkBanner TEXT");
    if (!columns.has("artworkVersion")) this.db.exec("ALTER TABLE pro_setup_task ADD COLUMN artworkVersion INTEGER NOT NULL DEFAULT 0");
  }

  ensure(input: {cityId: string; entitlementId: string; originalOwnerPubkey: string; currentOwnerPubkey: string; registrationVersion?: number}, now = Math.floor(Date.now() / 1000)): ProSetupTask {
    const existing = this.row(input.cityId);
    if (existing && existing.entitlementId !== input.entitlementId) throw new Error("Pro setup entitlement conflict requires operator review.");
    if (existing && input.registrationVersion !== undefined && existing.registrationVersion !== null && existing.registrationVersion !== input.registrationVersion) {
      throw new Error("Pro setup payout binding conflict requires operator review.");
    }
    if (!existing) {
      this.db.prepare(`INSERT INTO pro_setup_task(cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,registrationVersion,payoutVersion,state,createdAt,updatedAt)
        VALUES(?,?,?,?,?,NULL,'setup-required',?,?)`).run(input.cityId, input.entitlementId, input.originalOwnerPubkey, input.currentOwnerPubkey,
        input.registrationVersion ?? null, now, now);
    } else if (existing.currentOwnerPubkey !== input.currentOwnerPubkey) {
      // A prior owner's payout approval can never follow an ownership rotation.
      this.db.prepare("UPDATE pro_setup_task SET currentOwnerPubkey=?,payoutVersion=NULL,brandPubkey=NULL,backupAcknowledgedAt=NULL,brandVersion=brandVersion+1,state='setup-required',updatedAt=? WHERE cityId=?")
        .run(input.currentOwnerPubkey, now, input.cityId);
    } else if (existing.registrationVersion === null && input.registrationVersion !== undefined) {
      this.db.prepare("UPDATE pro_setup_task SET registrationVersion=?,updatedAt=? WHERE cityId=?")
        .run(input.registrationVersion, now, input.cityId);
    }
    return this.view(this.row(input.cityId)!);
  }

  confirmPayout(cityId: string, entitlementId: string, currentOwnerPubkey: string, payoutVersion: number, now = Math.floor(Date.now() / 1000)): ProSetupTask {
    const row = this.row(cityId);
    if (!row || row.entitlementId !== entitlementId || row.currentOwnerPubkey !== currentOwnerPubkey) throw new Error("Pro setup authority changed. Reload and try again.");
    this.db.prepare("UPDATE pro_setup_task SET payoutVersion=?,state=CASE WHEN brandPubkey IS NULL THEN 'payout-confirmed' ELSE 'ready-for-proof' END,updatedAt=? WHERE cityId=?")
      .run(payoutVersion, now, cityId);
    return this.view(this.row(cityId)!);
  }

  confirmSigner(cityId: string, entitlementId: string, currentOwnerPubkey: string, brandPubkey: string, now = Math.floor(Date.now() / 1000)): ProSetupTask {
    const row = this.row(cityId);
    if (!row || row.entitlementId !== entitlementId || row.currentOwnerPubkey !== currentOwnerPubkey) throw new Error("Pro setup authority changed. Reload and try again.");
    if (!/^[0-9a-f]{64}$/.test(brandPubkey) || brandPubkey === currentOwnerPubkey || brandPubkey === row.originalOwnerPubkey) throw new Error("Use a separate valid city signer identity.");
    if (row.brandPubkey !== null && row.brandPubkey !== brandPubkey) throw new Error("Clear the saved city signer before replacing it.");
    if (row.brandPubkey === brandPubkey && row.backupAcknowledgedAt !== null) return this.view(row);
    this.db.prepare(`UPDATE pro_setup_task SET brandPubkey=?,brandVersion=brandVersion+1,backupAcknowledgedAt=?,
      state=CASE WHEN payoutVersion IS NULL THEN 'signer-confirmed' ELSE 'ready-for-proof' END,updatedAt=? WHERE cityId=?`)
      .run(brandPubkey, now, now, cityId);
    return this.view(this.row(cityId)!);
  }

  clearSigner(cityId: string, entitlementId: string, currentOwnerPubkey: string, now = Math.floor(Date.now() / 1000)): ProSetupTask {
    const row = this.row(cityId);
    if (!row || row.entitlementId !== entitlementId || row.currentOwnerPubkey !== currentOwnerPubkey) throw new Error("Pro setup authority changed. Reload and try again.");
    if (row.brandPubkey === null) return this.view(row);
    this.db.prepare(`UPDATE pro_setup_task SET brandPubkey=NULL,brandVersion=brandVersion+1,backupAcknowledgedAt=NULL,
      state=CASE WHEN payoutVersion IS NULL THEN 'setup-required' ELSE 'payout-confirmed' END,updatedAt=? WHERE cityId=?`).run(now, cityId);
    return this.view(this.row(cityId)!);
  }

  confirmArtwork(cityId: string, entitlementId: string, currentOwnerPubkey: string, artwork: {revisionId: string; avatar: string; banner: string}, now = Math.floor(Date.now() / 1000)): ProSetupTask {
    const row = this.row(cityId);
    if (!row || row.entitlementId !== entitlementId || row.currentOwnerPubkey !== currentOwnerPubkey) throw new Error("Pro setup authority changed. Reload and try again.");
    if (!/^[0-9a-f]{64}$/.test(artwork.revisionId)) throw new Error("Invalid approved artwork revision.");
    for (const value of [artwork.avatar, artwork.banner]) {const url = new URL(value); if (url.protocol !== "https:") throw new Error("City profile artwork must use HTTPS.");}
    if (row.artworkRevisionId === artwork.revisionId && row.artworkAvatar === artwork.avatar && row.artworkBanner === artwork.banner) return this.view(row);
    this.db.prepare("UPDATE pro_setup_task SET artworkRevisionId=?,artworkAvatar=?,artworkBanner=?,artworkVersion=artworkVersion+1,updatedAt=? WHERE cityId=?")
      .run(artwork.revisionId, artwork.avatar, artwork.banner, now, cityId);
    return this.view(this.row(cityId)!);
  }

  get(cityId: string): ProSetupTask | null {
    const row = this.row(cityId);
    return row ? this.view(row) : null;
  }

  private row(cityId: string): TaskRow | undefined {
    return this.db.prepare("SELECT * FROM pro_setup_task WHERE cityId=?").get(cityId) as TaskRow | undefined;
  }

  private view(row: TaskRow): ProSetupTask {
    return {cityId: row.cityId, state: row.state, createdAt: row.createdAt, updatedAt: row.updatedAt,
      ...(row.registrationVersion === null ? {} : {registrationVersion: row.registrationVersion}),
      ...(row.payoutVersion === null ? {} : {payoutVersion: row.payoutVersion}),
      ...(row.brandPubkey === null || row.backupAcknowledgedAt === null ? {} : {signer: {pubkey: row.brandPubkey, version: row.brandVersion, confirmedAt: row.backupAcknowledgedAt}}),
      ...(row.artworkRevisionId === null || row.artworkAvatar === null || row.artworkBanner === null ? {} : {artwork: {revisionId: row.artworkRevisionId, avatar: row.artworkAvatar, banner: row.artworkBanner, version: row.artworkVersion}})};
  }
}
