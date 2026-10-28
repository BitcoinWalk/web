import {z} from "zod";
import type {Event} from "nostr-tools";
import {getPaymentRuntime} from "../../../payments/runtime";
import {paymentBody} from "../../../payments/request-body";
import {authorizeSponsor} from "../../../payments/sponsor-auth";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {promoteSponsorDraftLogo} from "../../../server/sponsor-logo-store";
export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"},token=z.string().regex(/^[a-f0-9]{64}$/),event=z.custom<Event>(value=>!!value&&typeof value==="object");
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),token,cityId:z.uuid(),count:z.union([z.literal(1),z.literal(2),z.literal(5)]),ids:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(5),invitationToken:token.optional()}).strict(),
 z.object({action:z.literal("create-batch"),token,scope:z.union([z.literal("regional"),z.literal("global")]),selections:z.array(z.object({cityId:z.uuid(),ids:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(250)}).strict()).min(2).max(30)}).strict(),
 z.object({action:z.literal("preview-invitation"),invitationToken:token}).strict(),
 z.object({action:z.literal("status"),token,id:z.uuid()}).strict(),
 z.object({action:z.literal("acknowledge-recovery"),token,id:z.uuid()}).strict(),
 z.object({action:z.literal("save-draft"),token,id:z.uuid(),name:z.string().max(80),website:z.string().max(2048)}).strict(),
 z.object({action:z.literal("claim"),token,id:z.uuid(),event}).strict(),
 z.object({action:z.literal("list"),event}).strict(),
 z.object({action:z.literal("mine"),event}).strict(),
]);
let catalogCache:{until:number;cities:Awaited<ReturnType<ReturnType<typeof getPaymentRuntime>["sponsors"]["available"]>>}|undefined;
export async function GET(){try{if(!catalogCache||catalogCache.until<Date.now()){catalogCache={cities:await getPaymentRuntime().sponsors.available(),until:Date.now()+10000};}return Response.json({cities:catalogCache.cities},{headers});}catch{return Response.json({error:"Walk availability could not be loaded. Please try again shortly."},{status:503,headers});}}
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return Response.json({error:"Payments are temporarily unavailable."},{status:503,headers});
 if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
 let body:z.infer<typeof command>;try{body=command.parse(await paymentBody(request));}catch{return Response.json({error:"Invalid sponsorship request."},{status:400,headers});}
 try{
  let actor:string|undefined;if(body.action==="list"||body.action==="mine"||body.action==="claim"){try{actor=authorizeSponsor(body.event,origin,body.action,body.action==="claim"?body.id:undefined);}catch{return Response.json({error:"A valid Nostr signature is required."},{status:403,headers});}if(body.action==="list"&&actor!==SUPER_ADMIN_PUBKEY)return Response.json({error:"Super-admin access required."},{status:403,headers});}
  const service=getPaymentRuntime().sponsors;
  if(body.action==="preview-invitation"){const invitation=await service.previewInvitation(body.invitationToken);return invitation?Response.json({invitation},{headers}):Response.json({error:"This sponsor invitation is invalid, expired, revoked or no longer eligible."},{status:404,headers});}
  if(body.action==="list")return Response.json({orders:service.list()},{headers});
  if(body.action==="mine")return Response.json({orders:service.mine(actor!)},{headers});
  if(body.action==="claim"){const draft=await service.status(body.id,body.token);if(!draft.pubkey&&draft.logoHash)for(const selection of draft.selections??[{cityId:draft.cityId}])await promoteSponsorDraftLogo({orderId:draft.id,sourceCityId:draft.cityId,cityId:selection.cityId,sponsorPubkey:actor!,hash:draft.logoHash});return Response.json({order:await service.claim(body.id,body.token,actor!,JSON.stringify(body.event))},{headers});}
  if(body.action==="save-draft")return Response.json({order:await service.saveDraft(body.id,body.token,body.name,body.website)},{headers});
  if(body.action==="acknowledge-recovery")return Response.json({order:await service.acknowledgeRecovery(body.id,body.token)},{headers});
  if(body.action==="status")return Response.json({order:await service.status(body.id,body.token)},{headers});
  // Caddy appends the connecting address on the right; never trust a supplied leftmost IP.
  const client=request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()||"unknown";
  const order=body.action==="create-batch"?await service.createBatch(body.token,client,body.selections,body.scope):await service.create(body.token,client,body.cityId,body.count,body.ids,body.invitationToken);catalogCache=undefined;return Response.json({order},{headers});
 }catch(error){const message=error instanceof Error?error.message:"";const safe=/^(Choose|Some walks|The global campaign|Invoice limit|Checkout|This (checkout|order|sponsorship)|Sponsor (invitation|name|website)|Private sponsor|Payment must|Sponsorship booking)/.test(message)?message:"Payment processing is temporarily unavailable. Your saved order can be checked again.";return Response.json({error:safe,selectionRejected:(body.action==="create"||body.action==="create-batch")&&/^(Choose|Some walks|The global campaign|Invoice limit|Sponsor invitation|Sponsorship booking)/.test(message)},{status:409,headers});}
}
