// Runs app workflow against ONLY the deployed private, disabled fixture API.
import {build} from "esbuild";
import {mkdtemp, readFile, lstat, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {DatabaseSync} from "node:sqlite";
import assert from "node:assert/strict";

const [origin, tokenFile, revision] = process.argv.slice(2);
if (!origin || !tokenFile || !/^[0-9a-f]{64}$/.test(revision ?? "")) throw new Error("Pass private loopback origin, private token filename and pinned artifact digest.");
const stat = await lstat(tokenFile);
if (!stat.isFile() || stat.mode & 0o077 || stat.size > 1024) throw new Error("Private token file required");
const temp = await mkdtemp(join(tmpdir(), "bitcoinwalk-workflow-acceptance-"));
let db;
try {
  await build({entryPoints:["src/rustress/workflow.ts", "src/rustress/client.ts"],outdir:temp,bundle:true,platform:"node",format:"esm",logLevel:"silent",outExtension:{".js":".mjs"}});
  const {RustressProvisioner} = await import(pathToFileURL(join(temp,"client.mjs")).href);
  const {ProvisionWorkflow} = await import(pathToFileURL(join(temp,"workflow.mjs")).href);
  const provider = new RustressProvisioner({origin,token:(await readFile(tokenFile,"utf8")).trim(),domain:"bitcoinwalk.org",adapterRevision:revision});
  const config = {cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"fixture-city",brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:1,payoutDestination:"fixture@example.org",walletRef:"isolated-test",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};
  // Explicit synthetic evidence, not the real-city authority resolver.
  const resolve = async()=>({config,proofHash:"e".repeat(64)});
  const file = join(temp,"workflow.fixture.sqlite");
  db = new DatabaseSync(file);
  let workflow = new ProvisionWorkflow(db,provider,resolve);
  await workflow.enqueue("fixture-request");
  assert.equal((await workflow.run(config.cityId)).state,"verified");
  db.close();db = new DatabaseSync(file);
  workflow = new ProvisionWorkflow(db,provider,resolve);
  assert.equal(workflow.status(config.cityId).state,"verified");
  assert.equal((await workflow.run(config.cityId)).state,"verified");
  assert.equal(db.prepare("SELECT count(*) n FROM rustress_provision_task").get().n,1);
  assert.equal((await provider.status(config)).invoiceIssuance,"disabled");
  console.log("PASS: app durable workflow to private VPS, exact fixture read-back, local database reopen/recovery, single saved task, no live identity or payment activation.");
} finally {db?.close();await rm(temp,{recursive:true,force:true});}
