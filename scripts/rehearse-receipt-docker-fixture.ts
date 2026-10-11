/** Synthetic-only Docker harness. Never load production keys or wallet URLs. */
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {appendFileSync,chmodSync,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {createServer,request} from "node:http";
import {DatabaseSync} from "node:sqlite";
import {encode,sign} from "bolt11";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {receiptEvidenceSocketHandler} from "../src/rustress/receipt-evidence-socket";
import {receiptRelayEgressHandler} from "../src/rustress/receipt-relay-egress";
import {PAYOUT_RECEIPT_EVIDENCE_API} from "../src/rustress/payout-invoice-issuer";
import {ZAP_RECEIPT_API} from "../src/rustress/zap-receipt-authority";

const root="/fixture",mode=process.argv[2];process.umask(0o077);
function save(path:string,value:string){writeFileSync(`${root}/${path}`,value,{mode:0o600});}
if(mode==="init"){
 for(const dir of ["worker-config","worker-secrets","worker-state","worker-socket","signer-config","signer-secrets","signer-state","signer-socket","evidence-socket","egress-socket"]){mkdirSync(`${root}/${dir}`,{mode:0o700});}
 const key=randomBytes(32),provider=getPublicKey(key),recipient=getPublicKey(randomBytes(32)),now=Math.floor(Date.now()/1000),preimage=randomBytes(32).toString("hex"),paymentHash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
 const raw=JSON.stringify(finalizeEvent({kind:9734,created_at:now,content:"Synthetic Docker rehearsal",tags:[["p",recipient],["amount","100000"],["relays","wss://fixture.example/"]]},randomBytes(32)));
 const descriptionHash=createHash("sha256").update(raw).digest("hex"),invoice=sign(encode({millisatoshis:"100000",timestamp:now,tags:[{tagName:"payment_hash",data:paymentHash},{tagName:"purpose_commit_hash",data:descriptionHash},{tagName:"expire_time",data:3600}]}),randomBytes(32).toString("hex")).paymentRequest!;
 const cityId=randomUUID(),claim={api:ZAP_RECEIPT_API,cityId,payoutVersion:1,paymentHash,recipientPubkey:recipient,amountMsat:"100000",zapRequest:raw};
 save("claim.json",JSON.stringify(claim));save("proof.json",JSON.stringify({api:PAYOUT_RECEIPT_EVIDENCE_API,cityId,payoutVersion:1,paymentHash,amountMsat:"100000",descriptionHash,invoice,settledAt:now,preimage}));
 save("worker-config/receipt-mode","armed");save("worker-config/provider-pubkey",provider);save("signer-config/provider-pubkey",provider);save("signer-secrets/provider-secret-key",key.toString("hex"));
 for(const name of ["receipt-evidence-token","signer-api-token","claim-api-token","relay-egress-api-token"]){const token=randomBytes(32).toString("base64url");save(`worker-secrets/${name}`,token);if(name==="signer-api-token")save(`signer-secrets/${name}`,token);}
}else if(mode==="serve"){
 const provider=readFileSync(`${root}/worker-config/provider-pubkey`,"utf8"),proof=JSON.parse(readFileSync(`${root}/proof.json`,"utf8"));
 const api={route:async(method:string,path:string,auth:string|undefined,input:unknown)=>{
  const expected={api:PAYOUT_RECEIPT_EVIDENCE_API,cityId:proof.cityId,payoutVersion:1,paymentHash:proof.paymentHash,amountMsat:proof.amountMsat,descriptionHash:proof.descriptionHash};
  return method==="POST"&&path==="/v1/receipts/evidence"&&auth===`Bearer ${readFileSync(`${root}/worker-secrets/receipt-evidence-token`,"utf8")}`&&JSON.stringify(input)===JSON.stringify(expected)?{status:200,body:proof}:{status:403,body:{error:"fixture-mismatch"}};
 }};
 const evidence=createServer(receiptEvidenceSocketHandler(api)),egress=createServer(receiptRelayEgressHandler(provider,{publish:async(relays,event)=>{appendFileSync(`${root}/attempts.jsonl`,JSON.stringify(event)+"\n",{mode:0o600});return existsSync(`${root}/allow-publication`)?relays:[];}},readFileSync(`${root}/worker-secrets/relay-egress-api-token`,"utf8")));
 for(const [server,path] of [[evidence,`${root}/evidence-socket/evidence.sock`],[egress,`${root}/egress-socket/relay.sock`]] as const)server.listen(path,()=>chmodSync(path,0o600));
}else if(mode==="allow")save("allow-publication","yes");
else if(mode==="verify"){
 const events=readFileSync(`${root}/attempts.jsonl`,"utf8").trim().split("\n").map(line=>JSON.parse(line));
 if(events.length<2||events.some(event=>JSON.stringify(event)!==JSON.stringify(events[0])))throw new Error("Receipt changed across restart");
 const db=new DatabaseSync(`${root}/signer-state/signer.sqlite`,{readOnly:true});const row=db.prepare("SELECT COUNT(*) count FROM bw_receipt_signer").get();db.close();if(row?.count!==1)throw new Error("Signer count mismatch");
 process.stdout.write("RECEIPT_DOCKER_REHEARSAL_OK exact_receipt_reused=yes synthetic_only=yes\n");
}else if(mode==="enqueue"||mode==="signed"||mode==="published"){
 const post=mode==="enqueue",body=post?readFileSync(`${root}/claim.json`,"utf8"):"";
 const req=request({socketPath:`${root}/worker-socket/intake.sock`,path:post?"/v1/receipts":"/health",method:post?"POST":"GET",headers:{authorization:`Bearer ${readFileSync(`${root}/worker-secrets/claim-api-token`,"utf8")}`,"content-type":"application/json","content-length":Buffer.byteLength(body)}},res=>{const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(chunk));res.on("end",()=>{try{const result=JSON.parse(Buffer.concat(chunks).toString());if(post?res.statusCode!==202:result.states?.[mode]!==1)process.exitCode=1;}catch{process.exitCode=1;}});});req.on("error",()=>{process.exitCode=1;});req.setTimeout(5000,()=>req.destroy());req.end(body);
}else throw new Error("Unknown fixture mode");
