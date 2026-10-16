import {createServer} from "node:http";
import {mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";

const version="0.1.1";
const stateRoot=process.env.BITCOINWALK_SPONSOR_PAYOUT_STATE??"/var/lib/bitcoinwalk-sponsor-payout";
const modePath=process.env.BITCOINWALK_SPONSOR_PAYOUT_MODE??"/run/bitcoinwalk-config/sponsor-payout-mode";
const statusPath=join(stateRoot,"status.json"),databasePath=join(stateRoot,"service.sqlite");

function mode(){
 const value=readFileSync(modePath,"utf8");
 if(value!=="disabled\n")throw new Error("Sponsor payout mode must remain disabled");
 return "disabled" as const;
}
function atomicStatus(value:unknown){const temporary=`${statusPath}.${process.pid}.tmp`;writeFileSync(temporary,`${JSON.stringify(value)}\n`,{mode:0o600});renameSync(temporary,statusPath);}
function initialize(){
 mkdirSync(stateRoot,{recursive:true,mode:0o700});
 const db=new DatabaseSync(databasePath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS sponsor_payout_service_state(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), mode TEXT NOT NULL CHECK(mode='disabled'),
  generation INTEGER NOT NULL CHECK(generation>=1), checkedAt INTEGER NOT NULL);
 INSERT INTO sponsor_payout_service_state(singleton,mode,generation,checkedAt) VALUES(1,'disabled',1,unixepoch())
 ON CONFLICT(singleton) DO UPDATE SET mode='disabled',generation=generation+1,checkedAt=unixepoch();`);
 const integrity=db.prepare("PRAGMA integrity_check").get() as Record<string,unknown>;
 if(Object.values(integrity)[0]!=="ok")throw new Error("Sponsor payout state integrity check failed");
 const row=db.prepare("SELECT mode,generation FROM sponsor_payout_service_state WHERE singleton=1").get() as {mode:string;generation:number}|undefined;
 db.close();if(!row||row.mode!=="disabled"||!Number.isSafeInteger(row.generation)||row.generation<1)throw new Error("Sponsor payout state unavailable");return row.generation;
}
function status(generation:number){return Object.freeze({service:"bitcoinwalk-sponsor-payout",version,mode:"disabled",payoutsEnabled:false,hostInvitationsEnabled:false,credentialLoaded:false,networkAccess:false,restartReconciliation:"blocked-disabled",generation});}

function main(){
 mode();const generation=initialize(),body=status(generation),heartbeat=()=>{mode();atomicStatus({...body,checkedAt:Math.floor(Date.now()/1000)});};heartbeat();
 const server=createServer((request,response)=>{
  if(request.method!=="GET"||request.url!=="/health"){response.writeHead(404,{"Content-Type":"application/json","Cache-Control":"no-store"});response.end('{"error":"not found"}\n');return;}
  response.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});response.end(`${JSON.stringify(body)}\n`);
 });
 server.listen(8896,"127.0.0.1");const timer=setInterval(heartbeat,30_000);timer.unref();let stopping=false;const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);server.close(()=>process.exit(0));};process.on("SIGTERM",stop);process.on("SIGINT",stop);
}

try{main();}catch{process.stderr.write("Sponsor payout service refused to start.\n");process.exitCode=1;}
