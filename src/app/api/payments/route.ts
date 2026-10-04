import {type Event} from "nostr-tools";
import {authorizePayment} from "../../../payments/auth";
import {paymentBody} from "../../../payments/request-body";
import {getPaymentRuntime} from "../../../payments/runtime";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {getLogoCatalog} from "../../../logos/runtime";
import type {LogoPackStatus} from "../../../logos/catalog";
import type {PaymentView} from "../../../payments/service";
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
  const service=getPaymentRuntime().service;
  switch(command.action){
   case "create":return Response.json({payment:await service.create(body.event.pubkey,command.cityId,command.revisionId)},{headers});
   case "status":return Response.json({payment:await service.status(body.event.pubkey,command.cityId)},{headers});
   case "list":{
    const payments=service.list(body.event.pubkey,SUPER_ADMIN_PUBKEY),logoPacks=visibleLogoPacks(getLogoCatalog().statuses(),payments,body.event.pubkey,SUPER_ADMIN_PUBKEY);
    return Response.json({payments,logoPacks},{headers});
   }
  }
 }catch{return Response.json({error:"Payment verification is temporarily unavailable. Your invoice and payment status remain saved."},{status:503,headers});}
}
