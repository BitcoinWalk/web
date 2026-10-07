import {getPaymentRuntime} from "../payments/runtime";
import {queryDirectoryRecords} from "../nostr/city-records";
import {LogoJobService, LogoJobStore} from "./approval-worker";
import {runLogoRenderer} from "./job-runner";
import {LogoCatalog} from "./catalog";
import {isApprovedLogoRoot} from "../lib/app-storage";

type LogoRuntime = {service: LogoJobService; store: LogoJobStore; timer: NodeJS.Timeout};
const runtimeKey = Symbol.for("bitcoinwalk.city-logo-runtime");
type RuntimeGlobal = typeof globalThis & {[runtimeKey]?: LogoRuntime};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sourceRelay(): string {
  const value=required("BITCOINWALK_SERVER_READ_RELAY"),url=new URL(value);
  if(!((url.protocol==="ws:"&&url.hostname==="127.0.0.1")||url.protocol==="wss:")||url.username||url.password||url.search||url.hash)throw new Error("Invalid server read relay");
  return url.href;
}

export function getLogoRuntime(): LogoRuntime {
  const shared = globalThis as RuntimeGlobal;
  if (shared[runtimeKey]) return shared[runtimeKey];
  const assetRoot = required("BITCOINWALK_CITY_LOGO_DIR");
  const renderer = required("BITCOINWALK_CITY_LOGO_RENDERER");
  if (process.env.NODE_ENV === "production" && !isApprovedLogoRoot(assetRoot)) throw new Error("City logo assets must use an approved app-owned persistent directory");
  if (process.env.NODE_ENV === "production" && !renderer.startsWith("/home/bitcoinwalk/")) throw new Error("City logo renderer must be owned by the app account");
  const payment = getPaymentRuntime();
  const store = new LogoJobStore(payment.store.db);
  const relay = sourceRelay();
  const service = new LogoJobService(store, () => queryDirectoryRecords([relay]), job => runLogoRenderer(job, {renderer, assetRoot}));
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await service.tick(); } catch { console.warn("City logo reconciliation deferred; durable job state was retained."); } finally { busy = false; } };
  const timer = setInterval(() => void tick(), 60_000); timer.unref();
  shared[runtimeKey] = {service, store, timer};
  setTimeout(() => void tick(), 5_000).unref();
  return shared[runtimeKey];
}

export function startLogoRuntime(): void {
  try { getLogoRuntime(); console.log("BitcoinWalk city logo approval reconciliation ready."); }
  catch { console.warn("BitcoinWalk city logo reconciliation is not configured."); }
}

export function getLogoCatalog(): LogoCatalog {
  const logo=getLogoRuntime(),payment=getPaymentRuntime();
  return new LogoCatalog(logo.store,payment.store);
}
