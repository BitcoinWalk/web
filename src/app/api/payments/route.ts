import {type Event} from "nostr-tools";
import {authorizePayment} from "../../../payments/auth";
import {paymentBody} from "../../../payments/request-body";
import {getPaymentRuntime} from "../../../payments/runtime";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
export const dynamic="force-dynamic",runtime="nodejs";
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
   case "list":return Response.json({payments:service.list(body.event.pubkey,SUPER_ADMIN_PUBKEY)},{headers});
  }
 }catch{return Response.json({error:"Payment verification is temporarily unavailable. Your invoice and payment status remain saved."},{status:503,headers});}
}

