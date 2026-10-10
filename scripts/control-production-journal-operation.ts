import {lstatSync,readFileSync} from "node:fs";
import {z} from "zod";
import {verifyPayoutOperation} from "../src/rustress/payout-operation";
import {SUPER_ADMIN_PUBKEY} from "../src/nostr/authority";

const stateRoot="/home/bitcoinwalk/journal-production-0.1.0/state",origin="http://127.0.0.1:8894";
const expected={admin:SUPER_ADMIN_PUBKEY,release:"0.2.14",binding:"8fd4868090ce593f175a8a0b039295abb4580bc96654db4989a4193f6d30e970",
 journalServiceId:"f89fa1a0-9ac9-4ca7-82dd-1acf19008910",budgetMsat:"797900000",maximumPayoutMsat:"790000000",maximumFeeMsat:"7900000",
 cityIds:["ca20993a-5b7f-443e-931e-8dbaa61d05fe"]};
const tokenPattern=/^[A-Za-z0-9_-]{43,256}$/;
const stateSchema=z.object({serviceId:z.literal(expected.journalServiceId),binding:z.literal(expected.binding),fence:z.uuid().nullable(),active:z.boolean(),lastSequence:z.number().int().safe().nonnegative()}).strict();

function protectedRead(path:string,max=65536){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600||s.uid!==process.getuid?.()||s.nlink!==1||s.size<1||s.size>max)throw new Error();return readFileSync(path,"utf8").trim();}
function token(name:string){const value=protectedRead(`${stateRoot}/${name}`,256);if(!tokenPattern.test(value))throw new Error();return value;}
async function request(path:string,credential:string,body?:unknown){const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),headers:{authorization:`Bearer ${credential}`,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok)throw new Error();return stateSchema.parse(await response.json());}
async function status(){return request("/v1/journal/status",token("client.token"));}
async function transition(action:"activate"|"pause",before:Awaited<ReturnType<typeof status>>){const after=await request("/v1/journal/control",token("operator.token"),{serviceId:before.serviceId,expectedFence:before.fence,action});if(after.active!==(action==="activate")||after.fence===before.fence)throw new Error();return after;}
function operation(path:string){
 const event=JSON.parse(protectedRead(path));
 // The pilot may retain Madeira alone or add the explicitly reviewed Islamabad
 // city. All limits, wallet binding and super-admin signature remain pinned.
 const cities=z.array(z.enum(["ca20993a-5b7f-443e-931e-8dbaa61d05fe","5c1c04f5-aead-4265-bce7-0f9ce0d9b5cd"])).min(1).max(2)
  .refine(values=>new Set(values).size===values.length&&values.includes("ca20993a-5b7f-443e-931e-8dbaa61d05fe")).parse(JSON.parse(event.content).cityIds);
 return verifyPayoutOperation(event,{...expected,cityIds:cities});
}

async function main(){if(process.getuid?.()===0)throw new Error();const [action,path]=process.argv.slice(2);if(!["inspect","activate","status","pause"].includes(action??""))throw new Error();
 if(action==="pause"){const before=await status();if(before.active)await transition("pause",before);if((await status()).active)throw new Error();process.stdout.write("PAYOUT_JOURNAL_OPERATION_PAUSED\n");return;}
 if(!path)throw new Error();const authority=operation(path),before=await status();
 if(action==="inspect"){process.stdout.write(`PAYOUT_JOURNAL_OPERATION_VALID expiresAt=${authority.expiresAt}\n`);return;}
 if(action==="activate"&&!before.active)await transition("activate",before);const after=await status();if(!after.active||!after.fence)throw new Error();
 process.stdout.write(`PAYOUT_JOURNAL_OPERATION_${action==="activate"?"ACTIVE":"READY"} expiresAt=${authority.expiresAt} lastSequence=${after.lastSequence}\n`);
}
main().catch(()=>{process.stderr.write("Payout journal operation refused.\n");process.exitCode=1;});
