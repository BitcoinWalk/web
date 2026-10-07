import type {DatabaseSync} from "node:sqlite";

export type ProSetupTask = {
  cityId: string;
  state: "setup-required" | "payout-confirmed";
  registrationVersion?: number;
  payoutVersion?: number;
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
      state TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );`);
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
      this.db.prepare("UPDATE pro_setup_task SET currentOwnerPubkey=?,payoutVersion=NULL,state='setup-required',updatedAt=? WHERE cityId=?")
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
    this.db.prepare("UPDATE pro_setup_task SET payoutVersion=?,state='payout-confirmed',updatedAt=? WHERE cityId=?")
      .run(payoutVersion, now, cityId);
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
      ...(row.payoutVersion === null ? {} : {payoutVersion: row.payoutVersion})};
  }
}
