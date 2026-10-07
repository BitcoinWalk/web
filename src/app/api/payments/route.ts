import {type Event} from "nostr-tools";
import {authorizePayment} from "../../../payments/auth";
import {paymentBody} from "../../../payments/request-body";
import {getPaymentRuntime} from "../../../payments/runtime";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {getLogoCatalog} from "../../../logos/runtime";
import type {LogoPackStatus} from "../../../logos/catalog";
import type {PaymentView} from "../../../payments/service";
import {verifyPurchasableCity} from "../../../payments/cities";
import {serverReadRelays} from "../../../lib/server-relay-config";
import {validatePayoutDestination} from "../../../server/lnurl-pay";
import {PayoutDestinationStore} from "../../../payments/payout-destination-store";
export const dynamic="force-dynamic",runtime="nodejs";
export function visibleLogoPacks(statuses:LogoPackStatus[],payments:PaymentView[],actor:string,superAdmin:string){
 const admin=actor===superAdmin,owned=new Set(payments.map(payment=>payment.cityId));
 return statuses.filter(pack=>admin||(pack.publiclyListed&&owned.has(pack.cityId))).map(pack=>({
  cityId:pack.cityId,revisionId:pack.revisionId,slug:pack.slug,cityName:pack.cityName,state:pack.state,attempts:pack.attempts,updatedAt:pack.updatedAt,
  publiclyListed:pack.publiclyListed,ready:pack.ready,...(pack.ready?{href:`/${encodeURIComponent(pack.slug)}/logo`}:{}),
 }));
}
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
  if(!origin)return Response.json({error:"City payments are not connected yet. Your submission is saved."},{status:503,headers});
  if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
  const body=await paymentBody(request) as {event:Event};
  let command;try{command=authorizePayment(body.event,origin);}catch{return Response.json({error:"Payment authorization required."},{status:403,headers});}
  const runtime=getPaymentRuntime(),service=runtime.service;
  switch(command.action){
   case "create":{
    const before=await verifyPurchasableCity(serverReadRelays(),command.cityId,command.revisionId);
    if(before.owner!==body.event.pubkey)throw new Error("Only the city creator can confirm this Pro payout destination.");
    const blockedDomains=(process.env.BITCOINWALK_PAYOUT_BLOCKED_DOMAINS??"").split(",").map(value=>value.trim()).filter(Boolean);
    const destination=await validatePayoutDestination(command.payoutDestination,{blockedDomains});
    const after=await verifyPurchasableCity(serverReadRelays(),command.cityId,command.revisionId);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("City ownership changed during payout validation. Reload and confirm again.");
    const version=new PayoutDestinationStore(runtime.store.db).saveRegistration(after,body.event,destination);
    return Response.json({payment:await service.create(body.event.pubkey,command.cityId,command.revisionId,version)},{headers});
   }
   case "status":return Response.json({payment:await service.status(body.event.pubkey,command.cityId)},{headers});
   case "list":{
    const payments=service.list(body.event.pubkey,SUPER_ADMIN_PUBKEY),logoPacks=visibleLogoPacks(getLogoCatalog().statuses(),payments,body.event.pubkey,SUPER_ADMIN_PUBKEY);
    return Response.json({payments,logoPacks},{headers});
   }
  }
 }catch(error){const message=error instanceof Error?error.message:"";const safe=/^(Only the city creator|City ownership changed|Enter a valid|The Lightning|Lightning endpoint|This destination|Use a personal)/.test(message);return Response.json({error:safe?message:"Payment verification is temporarily unavailable. Your invoice and payment status remain saved."},{status:safe?409:503,headers});}
}
