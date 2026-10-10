import {createServer} from "node:http";
import {randomBytes} from "node:crypto";
import {lstatSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {z} from "zod";
import {MAXIMUM_PAYOUT_OPERATION_SECONDS,PAYOUT_OPERATION_CONTRACT,verifyPayoutOperation} from "../src/rustress/payout-operation";
import {SUPER_ADMIN_PUBKEY} from "../src/nostr/authority";

const money=z.string().regex(/^[1-9][0-9]{0,15}$/),hex=z.string().regex(/^[0-9a-f]{64}$/);
const argumentsSchema=z.object({release:z.string().regex(/^0\.[0-9]+\.[0-9]+$/),binding:hex,journalServiceId:z.uuid(),budgetMsat:money,
 maximumPayoutMsat:money,maximumFeeMsat:money,cityIds:z.array(z.uuid()).min(1).max(10),output:z.string().min(1),port:z.number().int().min(1024).max(65535)}).strict();
const evidenceSchema=z.object({release:z.string().regex(/^0\.[0-9]+\.[0-9]+$/),binding:hex,journalServiceId:z.uuid(),budgetMsat:money,
 maximumPayoutMsat:money,maximumFeeMsat:money}).passthrough();

function canonicalCities(value:string){const cities=[...new Set(value.split(",").map(entry=>entry.trim()).filter(Boolean))].sort();return z.array(z.uuid()).min(1).max(10).parse(cities);}
function argumentsFrom(argv:string[]){
 const values:Record<string,string>={};for(let index=0;index<argv.length;index+=2){const key=argv[index],value=argv[index+1];if(!key?.startsWith("--")||!value)throw new Error("Invalid arguments");values[key.slice(2)]=value;}
 const common={cityIds:canonicalCities(values.cities??""),output:values.output,port:Number(values.port??"18083")};
 if(values.evidence){const path=resolve(values.evidence),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid?.())throw new Error("Private evidence file required");
  const evidence=evidenceSchema.parse(JSON.parse(readFileSync(path,"utf8")));
  return argumentsSchema.parse({release:evidence.release,binding:evidence.binding,journalServiceId:evidence.journalServiceId,budgetMsat:evidence.budgetMsat,
   maximumPayoutMsat:evidence.maximumPayoutMsat,maximumFeeMsat:evidence.maximumFeeMsat,...common});}
 return argumentsSchema.parse({...values,...common});
}

function html(expected:ReturnType<typeof argumentsFrom>,submitPath:string){
 const client=JSON.stringify({...expected,admin:SUPER_ADMIN_PUBKEY,contract:PAYOUT_OPERATION_CONTRACT,submitPath}).replaceAll("<","\\u003c");
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BitcoinWalk payout operation approval</title>
<style>body{font:17px system-ui,sans-serif;max-width:720px;margin:6vh auto;padding:24px;color:#20252b}main{border:1px solid #d8dde3;border-radius:14px;padding:28px}button{background:#f7931a;border:0;border-radius:8px;padding:14px 22px;font-size:17px;font-weight:700;cursor:pointer}button:disabled{opacity:.55}code{word-break:break-all}#status{min-height:1.5em}</style></head>
<body><main><h1>Approve Madeira payout operation</h1><p>This authorizes release <strong>${expected.release}</strong> to operate automatic 79/21 settlement for Madeira only. It is bound to the installed wallet, independent journal, fixed non-renewing budget and exact city ID.</p><p>The authority lasts no more than 30 days and must be renewed before expiry. Expiry closes city invoices and restores invoice-only operation. It never grants another city, changes a payout destination, renews the wallet budget or publishes anything to Nostr.</p><p>No nsec or wallet connection is sent to this page. Your browser extension signs the exact operation authority.</p><button id="approve">Review and sign 30-day operation</button><p id="status" role="status"></p></main>
<script>const expected=${client},button=document.getElementById("approve"),status=document.getElementById("status");button.onclick=async()=>{button.disabled=true;status.textContent="Waiting for your signer…";try{if(!window.nostr)throw new Error("No browser signer found. Open this page in the browser with nos2x.");const pubkey=await window.nostr.getPublicKey();if(pubkey!==expected.admin)throw new Error("Connect the BitcoinWalk super-admin identity in nos2x, then reload.");const now=Math.floor(Date.now()/1000),content={contract:expected.contract,mode:"continuous",release:expected.release,binding:expected.binding,journalServiceId:expected.journalServiceId,budgetMsat:expected.budgetMsat,maximumPayoutMsat:expected.maximumPayoutMsat,maximumFeeMsat:expected.maximumFeeMsat,cityIds:expected.cityIds,notBefore:now,expiresAt:now+${MAXIMUM_PAYOUT_OPERATION_SECONDS},nonce:crypto.randomUUID()},template={kind:30312,created_at:now,tags:[["d","bitcoinwalk-rustress-payout-operation"],["expiration",String(content.expiresAt)]],content:JSON.stringify(content)},event=await window.nostr.signEvent(template),response=await fetch(expected.submitPath,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(event)}),result=await response.json();if(!response.ok)throw new Error(result.error||"Approval was rejected.");status.textContent="Signed operation saved. It is not active until the reviewed deployment step completes.";}catch(error){status.textContent=error instanceof Error?error.message:"Approval failed safely.";button.disabled=false;}};</script></body></html>`;
}

async function main(){
 const input=argumentsFrom(process.argv.slice(2)),output=resolve(input.output),submitPath=`/approve-${randomBytes(24).toString("hex")}`,
  expected={admin:SUPER_ADMIN_PUBKEY,release:input.release,binding:input.binding,journalServiceId:input.journalServiceId,budgetMsat:input.budgetMsat,
   maximumPayoutMsat:input.maximumPayoutMsat,maximumFeeMsat:input.maximumFeeMsat,cityIds:input.cityIds};
 let accepted=false;const page=html(input,submitPath),server=createServer(async(request,response)=>{
  const send=(status:number,type:string,body:string)=>{response.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"});response.end(body);};
  if(request.method==="GET"&&request.url==="/"){send(200,"text/html; charset=utf-8",page);return;}
  if(request.method!=="POST"||request.url!==submitPath||request.headers.origin!==`http://127.0.0.1:${input.port}`||request.headers["content-type"]!=="application/json"||accepted){send(404,"application/json",JSON.stringify({error:"Not found."}));return;}
  try{const chunks:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>8192)throw new Error();chunks.push(Buffer.from(chunk));}const event=JSON.parse(Buffer.concat(chunks).toString("utf8"));verifyPayoutOperation(event,expected);
   writeFileSync(output,JSON.stringify(event)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});accepted=true;send(200,"application/json",JSON.stringify({saved:true}));setTimeout(()=>server.close(),250).unref();
  }catch{send(400,"application/json",JSON.stringify({error:"The exact signed operation was not accepted. Nothing was activated."}));}
 });
 server.requestTimeout=10_000;server.headersTimeout=5_000;server.maxRequestsPerSocket=4;await new Promise<void>((done,reject)=>{server.once("error",reject);server.listen(input.port,"127.0.0.1",done);});
 process.stdout.write(`PAYOUT_OPERATION_REVIEW_READY http://127.0.0.1:${input.port}/ output=${output}\n`);
}
main().catch(error=>{process.stderr.write(`Payout operation review could not start: ${error instanceof Error?error.message:"unknown error"}\n`);process.exitCode=1;});
