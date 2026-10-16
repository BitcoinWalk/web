import {createHash} from "node:crypto";
import {z} from "zod";
import type {Event} from "nostr-tools";
import {getPaymentRuntime} from "../../../payments/runtime";
import {authorizeSponsorInvitation,type SponsorInvitationCommand} from "../../../payments/sponsor-invitation-auth";
import {paymentBody} from "../../../payments/request-body";
import {eligibleSponsorHostCities} from "../../../server/sponsor-invitation-eligibility";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {sponsorHostPayoutScope} from "../../../payments/sponsor-host-payout-scope";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"},hex=z.string().regex(/^[a-f0-9]{64}$/),event=z.custom<Event>(value=>!!value&&typeof value==="object");
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("list"),event}).strict(),
 z.object({action:z.literal("create"),id:z.uuid(),cityId:z.uuid(),walkId:hex.nullable(),token:hex,expiresAt:z.number().int().positive(),event}).strict(),
 z.object({action:z.literal("revoke"),id:z.uuid(),event}).strict(),
 z.object({action:z.literal("admin-list"),event}).strict(),
 z.object({action:z.literal("admin-revoke"),id:z.uuid(),event}).strict(),
]);
type Command=z.infer<typeof command>;
function signedCommand(body:Command):SponsorInvitationCommand{
 switch(body.action){
  case "list":return {action:"list"};
  case "revoke":return {action:"revoke",id:body.id};
  case "admin-list":return {action:"admin-list"};
  case "admin-revoke":return {action:"admin-revoke",id:body.id};
  case "create":return {action:"create",id:body.id,cityId:body.cityId,walkId:body.walkId,tokenHash:createHash("sha256").update(body.token).digest("hex"),expiresAt:body.expiresAt};
 }
}
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return Response.json({error:"Payments are temporarily unavailable."},{status:503,headers});
 if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
 let body:Command;try{body=command.parse(await paymentBody(request));}catch{return Response.json({error:"Invalid sponsor invitation request."},{status:400,headers});}
 const scope=sponsorHostPayoutScope();
 if(!scope.enabled&&!body.action.startsWith("admin-"))return Response.json({error:"Host sponsor invitations are not available yet."},{status:503,headers});
 try{
  const actor=authorizeSponsorInvitation(body.event,origin,signedCommand(body)),runtime=getPaymentRuntime();
  if(body.action==="admin-list"){if(actor!==SUPER_ADMIN_PUBKEY)return Response.json({error:"Super-admin access required."},{status:403,headers});return Response.json({invitations:runtime.sponsorInvitations.listAll(),obligations:runtime.sponsors.hostPayoutAudit()},{headers});}
  if(body.action==="admin-revoke"){if(actor!==SUPER_ADMIN_PUBKEY)return Response.json({error:"Super-admin access required."},{status:403,headers});return Response.json({invitation:runtime.sponsorInvitations.revoke(body.id,actor,JSON.stringify(body.event),true)},{headers});}
  const eligible=(await eligibleSponsorHostCities(runtime.store.db,actor)).filter(city=>scope.allows(city.id)),available=await runtime.sponsors.available(),cities=eligible.map(city=>({...city,walks:available.find(item=>item.id===city.id)?.walks??[]}));
  if(body.action==="list")return Response.json({invitations:runtime.sponsorInvitations.list(actor),cities},{headers});
  if(body.action==="revoke")return Response.json({invitation:runtime.sponsorInvitations.revoke(body.id,actor,JSON.stringify(body.event))},{headers});
  const city=eligible.find(item=>item.id===body.cityId);if(!city)throw new Error("Choose an active Pro city that you own and finish its payout setup first.");
  const walk=body.walkId?available.find(item=>item.id===city.id)?.walks.find(item=>item.id===body.walkId):null;if(body.walkId&&!walk)throw new Error("Choose an available future walk in your city.");
  return Response.json({invitation:runtime.sponsorInvitations.create({id:body.id,token:body.token,cityId:city.id,cityName:city.name,walkId:walk?.id??null,walkLabel:walk?.label??null,hostPubkey:actor,payoutVersion:city.payoutVersion,expiresAt:body.expiresAt,authorizationEvent:JSON.stringify(body.event)})},{headers});
 }catch(error){const message=error instanceof Error?error.message:"Sponsor invitation unavailable.";return Response.json({error:/^(Choose|Sponsor invitation|Connect your host)/.test(message)?message:"Sponsor invitation evidence could not be verified."},{status:409,headers});}
}
