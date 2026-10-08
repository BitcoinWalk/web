import {lstatSync, readFileSync} from "node:fs";
import {RustressProvisioner} from "../rustress/client";
import {ProvisionWorkflow} from "../rustress/workflow";
import {getPaymentRuntime} from "../payments/runtime";
import {resolveRustressProvisionEvidence} from "./pro-setup";

/** Explicit opt-in and city allow-list; never enabled by selecting/paying Pro.
 * Transport must terminate at the isolated service through a private tunnel. */
function runtime() {
  if (process.env.BITCOINWALK_RUSTRESS_FIXTURE_ENABLED !== "1") return null;
  const allow = new Set((process.env.BITCOINWALK_RUSTRESS_FIXTURE_CITIES ?? "").split(",").filter(Boolean));
  if (!allow.size || allow.size > 10 || [...allow].some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)))
    throw new Error("Isolated provisioning city allow-list required.");
  const path = process.env.BITCOINWALK_RUSTRESS_TOKEN_FILE ?? "";
  if (!path.startsWith("/")) throw new Error("Private provisioning token file required.");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.mode & 0o077 || stat.size > 1024) throw new Error("Private provisioning token file required.");
  const provider = new RustressProvisioner({origin: process.env.BITCOINWALK_RUSTRESS_ORIGIN ?? "",
    // Runtime-only secret mounted outside the application; never bundle/trace it.
    token: readFileSync(/* turbopackIgnore: true */ path, "utf8").trim(), domain: "bitcoinwalk.org",
    adapterRevision: process.env.BITCOINWALK_RUSTRESS_REVISION ?? ""});
  const db = getPaymentRuntime().store.db;
  const resolve = async (request: string) => {
    const row = db.prepare("SELECT city_id FROM city_brand_request WHERE id=?").get(request) as {city_id: string} | undefined;
    if (!row || !allow.has(row.city_id)) throw new Error("City is not approved for isolated provisioning.");
    return resolveRustressProvisionEvidence(request);
  };
  return {workflow: new ProvisionWorkflow(db, provider, resolve), allow, db};
}

export async function queueIsolatedProvisioning(requestId: string) {
  const service = runtime();
  if (!service) return;
  await service.workflow.enqueue(requestId);
}

export async function reconcileIsolatedProvisioning() {
  const service = runtime();
  if (!service) return;
  // Recover a process exit/outage between brand activation and initial enqueue.
  for (const city of service.allow) {
    if (service.workflow.status(city)) continue;
    const row = service.db.prepare("SELECT id FROM city_brand_request WHERE city_id=? AND status='active' ORDER BY rowid DESC LIMIT 1").get(city) as {id: string} | undefined;
    if (row) {try {await service.workflow.enqueue(row.id);} catch {/* Fresh evidence unavailable; next pass will recheck. */}}
  }
  for (const city of service.workflow.pendingCities()) {
    if (service.allow.has(city)) await service.workflow.run(city);
  }
}
