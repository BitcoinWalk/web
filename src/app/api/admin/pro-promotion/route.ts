import {mkdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {backup} from "node:sqlite";
import type {Event} from "nostr-tools";
import {paymentBody} from "../../../../payments/request-body";
import {getPaymentRuntime} from "../../../../payments/runtime";
import {createAdminProPromotionTemplate,installAdminProPromotion} from "../../../../payments/admin-pro-promotion";
import {queryAuthorizations,queryDirectoryRecords} from "../../../../nostr/city-records";
import {serverReadRelays} from "../../../../lib/server-relay-config";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"};
async function evidence(){const relays=serverReadRelays(),[snapshot,authorizations]=await Promise.all([queryDirectoryRecords(relays),queryAuthorizations(relays)]);return {...snapshot,authorizations};}

export async function GET(request:Request){
 try{
  const cityId=new URL(request.url).searchParams.get("cityId")??"",current=await evidence();
  const template=createAdminProPromotionTemplate(current,{cityId,reason:"Approved complimentary lifetime Pro partnership by BitcoinWalk super-admin",nonce:randomUUID()});
  return Response.json({template},{headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Promotion could not be prepared."},{status:409,headers});}
}

export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
 if(!origin||request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
 try{
  const body=await paymentBody(request) as {event?:Event};if(!body.event)throw new Error("Signed promotion required.");
  const current=await evidence(),runtime=getPaymentRuntime(),checked=installAdminProPromotion(runtime.store.db,body.event,current,false);
  const backupDirectory="/home/bitcoinwalk/backups";mkdirSync(backupDirectory,{recursive:true,mode:0o700});
  const backupPath=`${backupDirectory}/admin-pro-promotion-${checked.cityId}-${Date.now()}.sqlite`;await backup(runtime.store.db,backupPath);
  runtime.store.db.exec("BEGIN IMMEDIATE");
  try{const result=installAdminProPromotion(runtime.store.db,body.event,current,true);runtime.store.db.exec("COMMIT");return Response.json({created:result.created,cityId:result.cityId,bundle:result.bundle},{headers});}
  catch(error){runtime.store.db.exec("ROLLBACK");throw error;}
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Promotion was refused."},{status:409,headers});}
}
