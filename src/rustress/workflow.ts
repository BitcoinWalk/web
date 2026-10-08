import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {ProvisioningError} from "./client";
import {provisionConfigSchema, provisionDigest, provisionReceiptSchema, type ProvisionConfig, type ProvisionReceipt} from "./contract";

export type ProvisionEvidence = {config: ProvisionConfig; proofHash: string};
type Phase = "queued" | "preparing" | "prepared" | "applying" | "unknown" | "verified" | "blocked";
type Row = {city: string; request: string; config: string; proof: string; phase: Phase; lease: string | null; until: number};
type Provider = {prepare(config: ProvisionConfig): Promise<ProvisionReceipt>; apply(config: ProvisionConfig): Promise<ProvisionReceipt>; status(config: ProvisionConfig): Promise<ProvisionReceipt>};
class AuthorityChanged extends Error {}

/** Private durable outbox. Not a payment/activation state. Initial version only;
 * changed evidence cannot silently replace an outstanding provider operation. */
export class ProvisionWorkflow {
  constructor(private db: DatabaseSync, private provider: Provider,
    private resolve: (requestId: string) => Promise<ProvisionEvidence>, private now = () => Date.now()) {
    db.exec(`CREATE TABLE IF NOT EXISTS rustress_provision_task (
      city TEXT PRIMARY KEY, request TEXT NOT NULL UNIQUE, config TEXT NOT NULL,
      proof TEXT NOT NULL, phase TEXT NOT NULL, lease TEXT, until INTEGER NOT NULL DEFAULT 0);`);
  }
  async enqueue(requestId: string) {
    const evidence = await this.resolve(requestId), config = provisionConfigSchema.parse(evidence.config);
    if (config.version !== 1 || !/^[0-9a-f]{64}$/.test(evidence.proofHash)) throw new Error("Provisioning evidence requires review.");
    const serialized = JSON.stringify(config);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.row(config.cityId);
      if (row && (row.request !== requestId || row.config !== serialized || row.proof !== evidence.proofHash)) throw new Error("Existing provisioning task requires review; no configuration was replaced.");
      if (!row) this.db.prepare("INSERT INTO rustress_provision_task(city,request,config,proof,phase) VALUES(?,?,?,?,'queued')").run(config.cityId, requestId, serialized, evidence.proofHash);
      this.db.exec("COMMIT");
      return this.status(config.cityId);
    } catch (error) {this.db.exec("ROLLBACK"); throw error;}
  }
  status(cityId: string) {
    const row = this.row(cityId);
    return row ? {cityId, state: row.phase, invoiceIssuance: "disabled" as const} : null;
  }
  pendingCities() {
    return (this.db.prepare("SELECT city FROM rustress_provision_task WHERE phase NOT IN ('verified','blocked') ORDER BY city LIMIT 10").all() as {city: string}[]).map(row => row.city);
  }
  private row(city: string) {return this.db.prepare("SELECT * FROM rustress_provision_task WHERE city=?").get(city) as Row | undefined;}
  async run(cityId: string) {
    const lease = randomUUID(), now = this.now();
    const claim = this.db.prepare("UPDATE rustress_provision_task SET lease=?,until=? WHERE city=? AND (lease IS NULL OR until<=?)")
      .run(lease, now + 120_000, cityId, now);
    if (!claim.changes) return this.status(cityId);
    const row = this.row(cityId)!;
    const set = (phase: Phase) => {
      if (!this.db.prepare("UPDATE rustress_provision_task SET phase=? WHERE city=? AND lease=? AND until>?").run(phase, cityId, lease, this.now()).changes)
        throw new Error("Provisioning worker lease expired.");
    };
    const fresh = async () => {
      const evidence = await this.resolve(row.request);
      if (JSON.stringify(provisionConfigSchema.parse(evidence.config)) !== row.config || evidence.proofHash !== row.proof) throw new AuthorityChanged();
      const current = this.row(cityId);
      if (current?.lease !== lease || current.until <= this.now()) throw new Error("Provisioning worker lease expired.");
    };
    const exact = (receipt: ProvisionReceipt, config: ProvisionConfig) => {
      const value = provisionReceiptSchema.parse(receipt);
      if (value.cityId !== cityId || value.version !== config.version || value.configHash !== provisionDigest(config)) throw new Error("Provider read-back mismatch.");
      return value;
    };
    try {
      if (row.phase === "blocked") return this.status(cityId);
      const config = provisionConfigSchema.parse(JSON.parse(row.config));
      // Recheck even previously verified tasks: provider drift must not remain green.
      await fresh();
      let phase = row.phase;
      if (["preparing", "applying", "unknown", "verified"].includes(phase)) {
        set("unknown");
        // An interrupted POST is reconciled read-only. Unavailable is NOT absent.
        const receipt = exact(await this.provider.status(config), config);
        await fresh();
        phase = receipt.state === "applied" ? "verified" : "prepared";
        set(phase);
        if (phase === "verified") return this.status(cityId);
      }
      if (phase === "queued") {
        await fresh(); set("preparing");
        exact(await this.provider.prepare(config), config);
        const receipt = exact(await this.provider.status(config), config);
        await fresh();
        phase = receipt.state === "applied" ? "verified" : "prepared";
        set(phase);
        if (phase === "verified") return this.status(cityId);
      }
      await fresh(); set("applying");
      exact(await this.provider.apply(config), config);
      const receipt = exact(await this.provider.status(config), config);
      if (receipt.state !== "applied") throw new Error("Apply is not independently confirmed.");
      await fresh(); set("verified");
    } catch (error) {
      // Never persist/log provider messages, destinations or authority details.
      const state = error instanceof AuthorityChanged || error instanceof ProvisioningError && error.outcome === "rejected" ? "blocked" : row.phase === "queued" && this.row(cityId)?.phase === "queued" ? "queued" : "unknown";
      this.db.prepare("UPDATE rustress_provision_task SET phase=? WHERE city=? AND lease=? AND until>?").run(state, cityId, lease, this.now());
    } finally {
      this.db.prepare("UPDATE rustress_provision_task SET lease=NULL,until=0 WHERE city=? AND lease=?").run(cityId, lease);
    }
    return this.status(cityId);
  }
}
