import {DatabaseSync} from "node:sqlite";
import {lstatSync, readFileSync} from "node:fs";
import {getEventHash, verifyEvent, type Event} from "nostr-tools";
import {MADEIRA_PILOT, type MadeiraSnapshot} from "../nostr/madeira-pilot";
import {queryCityAuthorization, queryPublishedCity} from "../nostr/city-records";
import {citySetupEvidence} from "./city-setup-evidence";
import {normalizePayoutDestination, validatePayoutDestination} from "./lnurl-pay";
import {MadeiraPilotStore} from "../rustress/madeira-pilot-store";
import {MadeiraManagedPilotStore} from "../rustress/madeira-managed-pilot-store";
import {MadeiraManagedActivationStore} from "../rustress/madeira-managed-activation-store";
import {ProvisionWorkflow} from "../rustress/workflow";
import {RustressProvisioner} from "../rustress/client";
import {authorizePayment} from "../payments/auth";

export function madeiraPilotEnabled() {
  return process.env.BITCOINWALK_MADEIRA_PILOT === "private-fixture-v1" &&
    process.env.BITCOINWALK_PAYMENT_APP_ORIGIN === MADEIRA_PILOT.origin &&
    process.env.BITCOINWALK_PAYMENT_DATABASE === "/var/lib/bitcoinwalk-app-staging/payments.sqlite" &&
    ["ws://127.0.0.1:3334/", "ws://127.0.0.1:3334"].includes(process.env.BITCOINWALK_SERVER_READ_RELAY ?? "");
}

export async function resolveMadeiraPilotSnapshot(db: DatabaseSync): Promise<MadeiraSnapshot> {
  const relays=["ws://127.0.0.1:3334/"];
  const city=await queryPublishedCity(relays,"madeira");
  if(!city||city.city.cityId!==MADEIRA_PILOT.cityId)throw new Error("Approve Madeira on staging first. Do not pay the invoice.");
  const grant=await queryCityAuthorization(relays,MADEIRA_PILOT.cityId);
  if(grant?.grant.creatorPubkey!==MADEIRA_PILOT.pubkey)throw new Error("Madeira creator does not match the agreed existing account.");
  const directory=await citySetupEvidence.discover(MADEIRA_PILOT.cityId,MADEIRA_PILOT.pubkey);
  if(directory&&directory.ownerPubkey!==MADEIRA_PILOT.pubkey)throw new Error("Madeira ownership changed; pilot stopped.");
  if(await citySetupEvidence.restrictions(MADEIRA_PILOT.cityId,MADEIRA_PILOT.pubkey))throw new Error("Madeira or its organizer is suspended.");
  // Approval must be read through the same strict managed-city resolution used
  // by the ordinary setup flow; never infer approval from a requested tier.
  const records=await citySetupEvidence.snapshot();
  const {managedCities}=await import("../nostr/moderation");
  const row=managedCities(records.revisions,records.approvals).find(r=>r.state==="approved"&&r.revision.city.cityId===MADEIRA_PILOT.cityId);
  if(!row||row.revision.event.id!==city.event.id)throw new Error("Madeira approval changed; reload the pilot.");
  const payout=db.prepare(`SELECT r.version,r.normalized,r.owner_event FROM registration_payout_version r
    JOIN payment_invoice_payout p ON p.destinationVersion=r.version
    JOIN payment_invoice i ON i.id=p.invoiceId AND i.cityId=r.city_id AND i.revisionId=r.revision_id
    WHERE r.city_id=? AND r.owner_pubkey=? AND r.revision_id=? ORDER BY r.version DESC LIMIT 1`)
    .get(MADEIRA_PILOT.cityId,MADEIRA_PILOT.pubkey,city.event.id) as {version:number;normalized:string;owner_event:string}|undefined;
  if(!payout)throw new Error("Madeira checkout payout confirmation is missing for the approved revision.");
  const proof:Event=JSON.parse(payout.owner_event), command=authorizePayment(proof,MADEIRA_PILOT.origin,proof.created_at);
  if(proof.pubkey!==MADEIRA_PILOT.pubkey||proof.kind!==27235||getEventHash(proof)!==proof.id||!verifyEvent(proof)||
    command.action!=="create"||command.cityId!==MADEIRA_PILOT.cityId||command.revisionId!==city.event.id||
    normalizePayoutDestination(command.payoutDestination).normalized!==payout.normalized)throw new Error("Madeira checkout payout signature is invalid.");
  await validatePayoutDestination(payout.normalized,{blockedDomains:["bitcoinwalk.org"]});
  return {revisionId:city.event.id,approvalEventId:row.decision.event.id,authorityEventId:directory?.eventId??grant.event.id,
    payoutVersion:payout.version,payoutDestination:payout.normalized};
}

let instance: ReturnType<typeof createRuntime>|undefined;
function createRuntime() {
  if(!madeiraPilotEnabled())throw new Error("Madeira pilot is disabled outside its exact staging environment.");
  const tokenPath="/home/bitcoinwalk/.config/bitcoinwalk-rustress-tunnel/api-token";
  const stat=lstatSync(tokenPath);if(!stat.isFile()||stat.mode&0o077||stat.size>1024)throw new Error("Private fixture token unavailable.");
  const provider=new RustressProvisioner({origin:"http://127.0.0.1:18890",domain:"bitcoinwalk.org",
    adapterRevision:"796b10d033024b33d0899bc8499f9ab5a7c113a68efcc5c8718c5c38797c41d7",
    token:readFileSync(/* turbopackIgnore: true */ tokenPath,"utf8").trim()});
  const db=new DatabaseSync("/var/lib/bitcoinwalk-app-staging/payments.sqlite");db.exec("PRAGMA busy_timeout=5000");
  const store=new MadeiraPilotStore(db,async()=>{
    const before=await resolveMadeiraPilotSnapshot(db),after=await resolveMadeiraPilotSnapshot(db);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("Madeira evidence changed during validation.");
    return after;
  });
  const managedStore=new MadeiraManagedPilotStore(db,async()=>{
    const before=await resolveMadeiraPilotSnapshot(db),after=await resolveMadeiraPilotSnapshot(db);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("Madeira evidence changed during validation.");
    return after;
  },process.env.BITCOINWALK_RUSTRESS_MANAGED_REVISION??"");
  const activationStore=new MadeiraManagedActivationStore(db,async()=>{
    const view=managedStore.view();if(!view?.ownerConfirmed||!view.adminConfirmed)throw new Error("Complete the managed reservation first.");
    const evidence=await managedStore.evidence(view.challenge.requestId);
    return {requestId:view.challenge.requestId,reserved:evidence.config,proofHash:evidence.proofHash};
  },process.env.BITCOINWALK_RUSTRESS_MANAGED_REVISION??"");
  const workflow=new ProvisionWorkflow(db,provider,id=>store.evidence(id));
  let busy=false;
  async function reconcile(explicit=true) {
    if(busy||!madeiraPilotEnabled())return;busy=true;
    try {
      const view=store.view();
      if(view?.adminConfirmed&&view.ownerConfirmed){
        if(!explicit && ["verified","blocked"].includes(workflow.status(MADEIRA_PILOT.cityId)?.state??""))return;
        if(!workflow.status(MADEIRA_PILOT.cityId))await workflow.enqueue(view.challenge.requestId);
        await workflow.run(MADEIRA_PILOT.cityId);
      }
    } finally {busy=false;}
  }
  const timer=setInterval(()=>void reconcile(false).catch(()=>console.warn("Private Madeira pilot deferred; no payment activation.")),60_000);timer.unref();
  return {store,managedStore,activationStore,workflow,reconcile};
}
export function getMadeiraPilot() {
  if(!madeiraPilotEnabled())throw new Error("Madeira pilot is disabled.");
  return instance??=createRuntime();
}
export function startMadeiraPilot() {
  if(!madeiraPilotEnabled())return;
  try {getMadeiraPilot();}catch {console.warn("Private Madeira pilot unavailable; payments unchanged.");}
}
