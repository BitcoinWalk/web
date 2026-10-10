import {createHash} from "node:crypto";
import {getPaymentRuntime} from "../../../payments/runtime";

export const dynamic="force-dynamic",runtime="nodejs";
const attempts=new Map<string,{time:number;count:number}>();
function tokenHash(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new Error("Checkout recovery token required.");return createHash("sha256").update(token).digest("hex");}
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 try{
  const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin||request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
  if(Number(request.headers.get("content-length")||0)>4096)return Response.json({error:"Request too large."},{status:413,headers});
  const body=await request.json() as Record<string,unknown>,action=body.action,cityId=String(body.cityId||""),token=String(body.token||"");
  if(!["create","status"].includes(String(action))||!/^[0-9a-f-]{36}$/.test(cityId))throw new Error("Invalid upgrade request.");
  const hash=tokenHash(token),key=`${hash}:${action}`,now=Date.now(),prior=attempts.get(key);
  if(prior&&now-prior.time<5000)return Response.json({error:"Please wait five seconds before retrying."},{status:429,headers});
  attempts.set(key,{time:now,count:(prior?.count??0)+1});for(const [entry,value] of attempts)if(now-value.time>3600_000)attempts.delete(entry);
  if(attempts.size>5000)return Response.json({error:"Upgrade checkout is temporarily busy."},{status:429,headers});
  const service=getPaymentRuntime().service;
  if(action==="create"){
   const revisionId=String(body.revisionId||"");if(!/^[0-9a-f]{64}$/.test(revisionId))throw new Error("Invalid city revision.");
   return Response.json({payment:await service.createGift(hash,cityId,revisionId)},{headers});
  }
  return Response.json({payment:await service.giftStatus(hash,cityId)},{headers});
 }catch(error){const message=error instanceof Error?error.message:"";const safe=/^(Only the current approved Basic city|The city owner|Gift checkout|Invoice renewal|Invoice creation)/.test(message);
  return Response.json({error:safe?message:"Upgrade checkout is temporarily unavailable. No payment status was changed."},{status:safe?409:503,headers});}
}

