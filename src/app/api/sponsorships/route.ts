import {z} from "zod";
import type {Event} from "nostr-tools";
import {getPaymentRuntime} from "../../../payments/runtime";
import {paymentBody} from "../../../payments/request-body";
import {authorizeSponsor} from "../../../payments/sponsor-auth";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"},token=z.string().regex(/^[a-f0-9]{64}$/),event=z.custom<Event>(value=>!!value&&typeof value==="object");
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),token,cityId:z.uuid(),count:z.union([z.literal(1),z.literal(2),z.literal(5)]),ids:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(5)}).strict(),
 z.object({action:z.literal("status"),token,id:z.uuid()}).strict(),
 z.object({action:z.literal("claim"),token,id:z.uuid(),event}).strict(),
 z.object({action:z.literal("list"),event}).strict(),
]);
let catalogCache:{until:number;cities:Awaited<ReturnType<ReturnType<typeof getPaymentRuntime>["sponsors"]["available"]>>}|undefined;
export async function GET(){try{if(!catalogCache||catalogCache.until<Date.now()){catalogCache={cities:await getPaymentRuntime().sponsors.available(),until:Date.now()+10000};}return Response.json({cities:catalogCache.cities},{headers});}catch{return Response.json({error:"Walk availability could not be loaded. Please try again shortly."},{status:503,headers});}}
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return Response.json({error:"Payments are temporarily unavailable."},{status:503,headers});
 if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
 let body:z.infer<typeof command>;try{body=command.parse(await paymentBody(request));}catch{return Response.json({error:"Invalid sponsorship request."},{status:400,headers});}
 try{
  let actor:string|undefined;if(body.action==="list"||body.action==="claim"){try{actor=authorizeSponsor(body.event,origin,body.action,body.action==="claim"?body.id:undefined);}catch{return Response.json({error:"A valid Nostr signature is required."},{status:403,headers});}if(body.action==="list"&&actor!==SUPER_ADMIN_PUBKEY)return Response.json({error:"Super-admin access required."},{status:403,headers});}
  const service=getPaymentRuntime().sponsors;
  if(body.action==="list")return Response.json({orders:service.list()},{headers});
  if(body.action==="claim")return Response.json({order:await service.claim(body.id,body.token,actor!,JSON.stringify(body.event))},{headers});
  if(body.action==="status")return Response.json({order:await service.status(body.id,body.token)},{headers});
  // Caddy appends the connecting address on the right; never trust a supplied leftmost IP.
  const client=request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()||"unknown";
  const order=await service.create(body.token,client,body.cityId,body.count,body.ids);catalogCache=undefined;return Response.json({order},{headers});
 }catch(error){const message=error instanceof Error?error.message:"";const safe=/^(Choose|Some walks|Invoice limit|Checkout|This (checkout|order)|Payment must|Sponsorship booking)/.test(message)?message:"Payment processing is temporarily unavailable. Your saved order can be checked again.";return Response.json({error:safe,selectionRejected:body.action==="create"&&/^(Choose|Some walks|Invoice limit|Sponsorship booking)/.test(message)},{status:409,headers});}
}
