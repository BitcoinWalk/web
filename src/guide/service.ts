import { readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { SimplePool, finalizeEvent, type Event } from "nostr-tools";
import { configSchema, assertBotKey, selectInbox, guideProfile, signTransportAuth } from "./core";
import { Outbox } from "./outbox";
import { history, publishIdempotent, readAnyComplete } from "./transport";
import { SUPER_ADMIN_PUBKEY } from "../nostr/authority";
import { parseCityRevision, parseApprovalRecord, pendingCityRevisions, type CityRevision, type ApprovalRecord } from "../nostr/city-records";
import {managedCities} from "../nostr/moderation";
import {readGuideReplicationStatus} from "./replication";
import {verifiedLivePublications} from "./live";
import {exactLiveDeliveryForRetry, exactReplicationDeliveryForRetry, type PersistedDelivery} from "./operator";
import {readGuideDirectoryRequests} from "./directory";
import {readGuideProSetupTasks} from "./pro-setup";

async function main() {
  process.umask(0o077);
  const configPath = process.env.GUIDE_CONFIG;
  if (!configPath) throw new Error("Set GUIDE_CONFIG to the reviewed configuration path.");
  const config = configSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
  const dryRun = process.argv.includes("--dry-run");
  const publishProfile = process.argv.includes("--publish-profile");
  const printIdentity = process.argv.includes("--print-identity");
  const checkReplication = process.argv.includes("--check-replication");
  const checkDirectory = process.argv.includes("--check-directory");
  const checkProSetup = process.argv.includes("--check-pro-setup");
  const baselineDirectory = process.argv.includes("--baseline-directory");
  const retryIndex=process.argv.indexOf("--retry-delivery");
  const retryDelivery=retryIndex!==-1;
  const retryReplicationIndex=process.argv.indexOf("--retry-replication-delivery");
  const retryReplicationDelivery=retryReplicationIndex!==-1;
  const selectedRetryIndex=retryDelivery?retryIndex:retryReplicationIndex;
  const retrySubmission=(retryDelivery||retryReplicationDelivery)?process.argv[selectedRetryIndex+1]:undefined;
  const retryRecipient=(retryDelivery||retryReplicationDelivery)?process.argv[selectedRetryIndex+2]:undefined;
  const retryPurpose=retryReplicationDelivery?process.argv[selectedRetryIndex+3]:undefined;
  if(retryDelivery&&(!retrySubmission||!retryRecipient))throw new Error("Retry requires an exact live submission and recipient.");
  if(retryReplicationDelivery&&(!retrySubmission||!retryRecipient||!retryPurpose))throw new Error("Replication retry requires an exact submission, recipient and purpose.");
  if([dryRun,publishProfile,printIdentity,checkReplication,checkDirectory,checkProSetup,baselineDirectory,retryDelivery,retryReplicationDelivery].filter(Boolean).length>1)throw new Error("Choose only one Guide operation mode.");
  if (!dryRun && !publishProfile && !printIdentity && !checkReplication && !checkDirectory && !checkProSetup && !baselineDirectory && !retryDelivery && !retryReplicationDelivery && !config.enabled) throw new Error("Guide is disabled. Complete dry-run and operator review before enabling.");
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
    if(printIdentity){process.stdout.write(bot+"\n");secret.fill(0);return;}
    if(checkReplication){const report=await readGuideReplicationStatus(secret);console.log(`Guide replication authorization passed: ${report.state}; ${report.cities.length} city row(s).`);secret.fill(0);return;}
    if(checkDirectory){if(!config.directoryStatusURL)throw new Error("Directory status URL is absent.");try{const rows=await readGuideDirectoryRequests(secret,config.directoryStatusURL);console.log(`Guide directory authorization passed; ${rows.length} request row(s).`);secret.fill(0);return;}catch(error){console.error(`Guide directory authorization failed: ${error instanceof Error?error.message:"unknown failure"}`);secret.fill(0);process.exitCode=1;return;}}
    if(checkProSetup){if(!config.proSetupStatusURL)throw new Error("Pro setup status URL is absent.");try{const rows=await readGuideProSetupTasks(secret,config.proSetupStatusURL);console.log(`Guide Pro setup authorization passed; ${rows.length} actionable task row(s).`);secret.fill(0);return;}catch(error){console.error(`Guide Pro setup authorization failed: ${error instanceof Error?error.message:"unknown failure"}`);secret.fill(0);process.exitCode=1;return;}}
    if(baselineDirectory){if(!config.directoryStatusURL||!config.directoryAdminURL)throw new Error("Directory notification configuration is absent.");const box=new Outbox(join(state,"guide.sqlite"));try{box.bind(bot,config.sourceRelay);const rows=await readGuideDirectoryRequests(secret,config.directoryStatusURL),queued=box.ingestDirectory(rows,secret,config.directoryAdminURL);if(queued!==0)throw new Error("Historical directory baseline unexpectedly queued a message.");console.log(`Guide directory baseline accepted; ${rows.length} existing request row(s), zero historical messages queued.`);}finally{box.close();secret.fill(0);}return;}
    if(!retryDelivery&&!retryReplicationDelivery){
      outbox = new Outbox(join(state, "guide.sqlite"));
      outbox.bind(bot, config.sourceRelay);
      console.log("BitcoinWalk Guide notification worker started; bot public key:", bot);
    }
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
    if(retryDelivery||retryReplicationDelivery){
      const state=process.env.STATE_DIRECTORY!;
      const db=new DatabaseSync(join(state,"guide.sqlite"),{readOnly:true});
      let row:PersistedDelivery|undefined;
      try {row=db.prepare("SELECT submission,recipient,wrapped,state,purpose FROM delivery WHERE submission=? AND recipient=?").get(retrySubmission!,retryRecipient!) as PersistedDelivery|undefined;}
      finally {db.close();}
      const wrapped=retryReplicationDelivery
        ? exactReplicationDeliveryForRetry(row,retrySubmission!,retryRecipient!,retryPurpose!)
        : exactLiveDeliveryForRetry(row,retrySubmission!,retryRecipient!);
      const lists=await readAnyComplete(pool,config.discoveryRelays,{kinds:[10050],authors:[retryRecipient!],limit:10});
      const relays=selectInbox(lists,retryRecipient!,config.allowedInboxRelays);
      const result=await publishIdempotent(pool,relays,wrapped,async template=>signTransportAuth(template,secret!,relays));
      console.log(JSON.stringify({submission:retrySubmission,recipient:retryRecipient,purpose:retryPurpose??"live",eventId:wrapped.id,destinations:relays,result,reusedExactEvent:true}));
      return;
    }
    do {
      try {
        // Re-read retained history: event timestamps are author-controlled, not an ingestion cursor.
        const revisionEvents = await history(pool, config.sourceRelay, 30303);
        const decisionEvents = await history(pool, config.sourceRelay, 30304, SUPER_ADMIN_PUBKEY);
        const calendarEvents = await history(pool, config.sourceRelay, 31923);
        const revisions = revisionEvents.map(parseCityRevision).filter((r): r is CityRevision => r !== null);
        const decisions = decisionEvents.map(parseApprovalRecord).filter((r): r is ApprovalRecord => r !== null);
        const pending = pendingCityRevisions(revisions, decisions);
        const live=verifiedLivePublications(revisions,decisions,calendarEvents);
        const replication=dryRun?undefined:await readGuideReplicationStatus(secret!);
        const directory=dryRun||!config.directoryStatusURL||!config.directoryAdminURL?undefined:await readGuideDirectoryRequests(secret!,config.directoryStatusURL);
        const proSetup=dryRun||!config.proSetupStatusURL||!config.proSetupAdminURL?undefined:await readGuideProSetupTasks(secret!,config.proSetupStatusURL);
        const replicationOrganizers=new Map(managedCities(revisions,decisions).filter(city=>city.state==="approved").map(city=>[city.revision.city.cityId,{recipient:city.revision.event.pubkey,cityName:city.revision.city.cityName}]));
        if (dryRun) {
          for (const recipient of config.recipients) {
            const lists = await readAnyComplete(pool, config.discoveryRelays, { kinds: [10050], authors: [recipient], limit: 10 });
            selectInbox(lists, recipient, config.allowedInboxRelays);
          }
          console.log(`Dry run passed: ${pending.length} pending revisions; all recipient inboxes verified. No key loaded, messages sent or baseline written.`);
          return;
        }
        const queued = outbox!.ingest(revisionEvents, pending, config.recipients, secret!, config.adminURL)
          + outbox!.ingestLive(live, secret!, config.adminURL, config.sourceRelay)
          + outbox!.ingestReplication(replication!.cities,replicationOrganizers,secret!)
          + (directory?outbox!.ingestDirectory(directory,secret!,config.directoryAdminURL!):0)
          + (proSetup?outbox!.ingestProSetup(proSetup,secret!,config.proSetupAdminURL!):0);
        console.log(`Scan complete; ${queued} new recipient notification(s) queued.`);
        const pendingIDs = new Set(pending.map(r => r.event.id));
        const liveIDs = new Set(live.map(item => `live:${item.approval.event.id}`));
        const replicationStates=new Map(replication!.cities.map(city=>[city.cityId,city.state]));
        const directoryStates=new Map((directory??[]).map(request=>[request.id,`${request.status}:${request.activationState}`]));
        const proSetupCurrent=new Map((proSetup??[]).map(task=>[task.kind==="setup"?`pro-setup:${task.cityId}`:`payout-update:${task.cityId}:${task.payoutVersion}:${task.state==="active"?"active":task.state==="blocked"||task.state==="needs-attention"?"attention":"pending"}`,task.ownerPubkey]));
        for (const row of outbox!.due(Math.floor(Date.now()/1000))) {
          if (stopping) break;
          if (row.purpose === "review" && !config.recipients.includes(row.recipient)) { outbox!.state(row, "removed-recipient"); continue; }
          const replicationCity=row.submission.startsWith("replication:")?row.submission.split(":")[1]:"";
          const directoryMatch=/^directory:([0-9a-f-]{36}):(directory-(?:invitation|active|failed))$/.exec(row.submission),directoryState=directoryMatch?directoryStates.get(directoryMatch[1]):undefined;
          const current=row.purpose==="pro-setup-required"||row.purpose.startsWith("payout-update-")?proSetupCurrent.get(row.submission)===row.recipient:row.purpose==="replication-degraded"?replicationStates.get(replicationCity)==="degraded":row.purpose==="replication-recovered"?replicationStates.get(replicationCity)==="healthy":row.purpose==="directory-invitation"?directoryState?.startsWith("awaiting-owner:")===true:row.purpose==="directory-active"?directoryState?.endsWith(":active")===true:row.purpose==="directory-failed"?directoryState?.endsWith(":failed")===true:row.purpose==="review"?pendingIDs.has(row.submission):liveIDs.has(row.submission);
          if(!current){outbox!.state(row,"obsolete");continue;}
          let relays:string[];
          try {
            // Recheck decisions immediately before sending delayed work.
            if (row.purpose === "review") {
              const fresh = (await history(pool, config.sourceRelay, 30304, SUPER_ADMIN_PUBKEY)).map(parseApprovalRecord).filter((r): r is ApprovalRecord => r !== null);
              if (!pendingCityRevisions(revisions, fresh).some(r => r.event.id === row.submission)) { outbox!.state(row, "obsolete"); continue; }
            }
            const lists = await readAnyComplete(pool, config.discoveryRelays, { kinds: [10050], authors: [row.recipient], limit: 10 });
            relays = selectInbox(lists, row.recipient, config.allowedInboxRelays);
          }catch{
            outbox!.retry(row,Math.floor(Date.now()/1000));
            console.error("Notification deferred: inbox discovery or allowlist validation failed. Exact event retained for retry.");continue;
          }
          try{
            const wrapped:Event=JSON.parse(row.wrapped);
            // Retries reuse the exact persisted gift-wrap ID. A relay-confirmed
            // duplicate proves that exact ID is already stored.
            await publishIdempotent(pool,relays,wrapped,async template=>signTransportAuth(template,secret!,relays));
            outbox!.state(row, "acknowledged");
            console.log("Notification acknowledged by an inbox relay (not proof of reading).");
          } catch(error) {
            outbox!.retry(row, Math.floor(Date.now()/1000));
            console.error(`Notification deferred: ${error instanceof Error?error.message:"publication failed: unknown"}. Exact event retained for retry.`);
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
