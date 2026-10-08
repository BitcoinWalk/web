// Real Rust process acceptance, always against generated local fixture state.
import {build} from "esbuild";
import {spawn} from "node:child_process";
import {randomBytes, createHash} from "node:crypto";
import {mkdtemp, writeFile, rm, readFile, chmod} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {DatabaseSync} from "node:sqlite";
import assert from "node:assert/strict";

const binary = process.argv[2];
if (!binary) throw new Error("Pass the locally compiled, patched Rustress binary path.");
const temp = await mkdtemp(join(tmpdir(), "bitcoinwalk-rustress-fixture-"));
const token = randomBytes(32).toString("base64url"), tokenFile = join(temp,"token"), database = join(temp,"isolated.fixture.sqlite");
const revision = createHash("sha256").update(await readFile(resolve(binary))).digest("hex");
const sleep = ms => new Promise(done => setTimeout(done, ms));
let child;
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(done => child.once("exit", done)); child.kill("SIGTERM"); await exited;
  }
  child = undefined;
}
const socket = createServer();
await new Promise(done => socket.listen(0,"127.0.0.1",done));
const port = socket.address().port; await new Promise(done => socket.close(done));
const origin = `http://127.0.0.1:${port}`;
function launch(db = database) {
  child = spawn(resolve(binary), [], {cwd:temp, stdio:"ignore", env:{
    BITCOINWALK_PROVISIONING_ISOLATED:"1", BW_PROVISION_TEST_DB:db,
    BW_PROVISION_DOMAIN:"bitcoinwalk.org", BW_PROVISION_REVISION:revision,
    BW_PROVISION_TOKEN_FILE:tokenFile, BW_PROVISION_PORT:String(port), BW_PROVISION_WALLET_REFS:"isolated-test",
  }});
}
async function ready(client) {
  for (let attempt=0;attempt<50;attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Fixture server exited before readiness");
    try {await client.capabilities();return;} catch {await sleep(100);}
  }
  throw new Error("Fixture service did not become ready");
}
function counts() {
  const db = new DatabaseSync(database,{readOnly:true});
  try {return ["users","prism_splits","bw_configs"].map(t=>Number(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n));}
  finally {db.close();}
}
try {
  await writeFile(tokenFile,token,{mode:0o600});
  const bundled = join(temp,"client.mjs");
  await build({entryPoints:["src/rustress/client.ts"],outfile:bundled,bundle:true,platform:"node",format:"esm",logLevel:"silent"});
  const {RustressProvisioner} = await import(pathToFileURL(bundled).href);
  const options = {origin,token,domain:"bitcoinwalk.org",adapterRevision:revision};
  const client = new RustressProvisioner(options);
  const config = {cityId:"00000000-0000-4000-8000-000000000001",version:1,domain:"bitcoinwalk.org",localPart:"fixture-city",brandPubkey:"a".repeat(64),authorityEventId:"b".repeat(64),approvalEventId:"c".repeat(64),brandEventId:"d".repeat(64),payoutVersion:1,payoutDestination:"fixture@example.org",walletRef:"isolated-test",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"};
  launch(); await ready(client);
  assert.equal((await fetch(origin+"/v1/bitcoinwalk/capabilities")).status,401);
  for (const path of ["/admin","/.well-known/nostr.json?name=fixture-city","/.well-known/lnurlp/fixture-city","/lnurlp/fixture-city/callback?amount=1000"]) assert.equal((await fetch(origin+path)).status,404);
  assert.equal((await client.prepare(config)).state,"prepared");
  assert.deepEqual(counts(),[0,0,1]);
  // Simulate losing a POST response after the provider committed it.
  const uncertain = new RustressProvisioner(options,async (url,init) => {
    const response = await fetch(url,init);
    if (init?.method === "POST") {await response.body?.cancel();throw new Error("fixture response lost");}
    return response;
  });
  await assert.rejects(uncertain.apply(config), e=>e.outcome==="unknown");
  assert.equal((await client.status(config)).state,"applied");
  const replies = await Promise.all([client.apply(config),client.apply(config)]);
  assert.deepEqual(replies[0],replies[1]);
  assert.equal((await client.prepare(config)).state,"applied");
  assert.deepEqual(counts(),[1,1,1]);
  await assert.rejects(client.prepare({...config,brandPubkey:"e".repeat(64)}),e=>e.outcome==="rejected");
  await assert.rejects(client.prepare({...config,cityId:"00000000-0000-4000-8000-000000000002"}),e=>e.outcome==="rejected");
  await stop(); launch(); await ready(client);
  assert.equal((await client.status(config)).state,"applied");
  assert.equal((await client.apply(config)).state,"applied");
  assert.deepEqual(counts(),[1,1,1]);
  const db = new DatabaseSync(database);
  db.prepare("UPDATE prism_splits SET percentage=50").run(); db.close();
  await assert.rejects(client.status(config),e=>e.outcome==="unavailable");
  await stop();
  // An existing unmarked database must be refused without schema mutation.
  const unmarked=join(temp,"unmarked.fixture.sqlite"), other=new DatabaseSync(unmarked);
  other.exec("CREATE TABLE sentinel(value TEXT)"); other.close();
  launch(unmarked);
  for(let attempt=0;child.exitCode===null&&attempt<50;attempt++)await sleep(100);
  assert.notEqual(child.exitCode,null); assert.notEqual(child.exitCode,0);
  const check=new DatabaseSync(unmarked,{readOnly:true});
  assert.deepEqual(check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name),["sentinel"]);check.close();
  await stop();
  await chmod(tokenFile,0o644); launch();
  for(let attempt=0;child.exitCode===null&&attempt<50;attempt++)await sleep(100);
  assert.notEqual(child.exitCode,null); assert.notEqual(child.exitCode,0);
  await stop();
  // Losing the isolated-mode flag must not expose fixture entries publicly.
  child = spawn(resolve(binary), [], {cwd:temp, stdio:"ignore", env:{
    DATABASE_URL:`sqlite://${database}`, ADMIN_PASSWORD:randomBytes(32).toString("base64url"),
  }});
  for(let attempt=0;child.exitCode===null&&attempt<50;attempt++)await sleep(100);
  assert.notEqual(child.exitCode,null); assert.notEqual(child.exitCode,0);
  console.log("Rustress API acceptance passed: auth, public-route denial, canonical digests, prepare/apply, lost-response reconciliation, duplicate/concurrent retries, conflicts, restart, drift, unmarked-DB and token-permission guards. No live credentials or payments used.");
} finally {await stop();await rm(temp,{recursive:true,force:true});}
