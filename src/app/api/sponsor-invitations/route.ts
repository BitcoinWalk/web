import {createHash} from "node:crypto";
import {z} from "zod";
import type {Event} from "nostr-tools";
import {getPaymentRuntime} from "../../../payments/runtime";
import {authorizeSponsorInvitation,type SponsorInvitationCommand} from "../../../payments/sponsor-invitation-auth";
import {paymentBody} from "../../../payments/request-body";
import {eligibleSponsorHostCities} from "../../../server/sponsor-invitation-eligibility";

export const dynamic="force-dynamic",runtime="nodejs";
const headers={"Cache-Control":"no-store"},hex=z.string().regex(/^[a-f0-9]{64}$/),event=z.custom<Event>(value=>!!value&&typeof value==="object");
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("list"),event}).strict(),
 z.object({action:z.literal("create"),id:z.uuid(),cityId:z.uuid(),token:hex,expiresAt:z.number().int().positive(),event}).strict(),
 z.object({action:z.literal("revoke"),id:z.uuid(),event}).strict(),
]);
export async function POST(request:Request){
 const origin=process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;if(!origin)return Response.json({error:"Payments are temporarily unavailable."},{status:503,headers});
 if(request.headers.get("origin")!==origin)return Response.json({error:"Origin not allowed."},{status:403,headers});
 if(process.env.BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED!=="1")return Response.json({error:"Host sponsor invitations are not available yet."},{status:503,headers});
 let body:z.infer<typeof command>;try{body=command.parse(await paymentBody(request));}catch{return Response.json({error:"Invalid sponsor invitation request."},{status:400,headers});}
 try{
  const signed: SponsorInvitationCommand=body.action==="list"?{action:"list"}:body.action==="revoke"?{action:"revoke",id:body.id}:{action:"create",id:body.id,cityId:body.cityId,tokenHash:createHash("sha256").update(body.token).digest("hex"),expiresAt:body.expiresAt},actor=authorizeSponsorInvitation(body.event,origin,signed),runtime=getPaymentRuntime(),eligible=await eligibleSponsorHostCities(runtime.store.db,actor);
  if(body.action==="list")return Response.json({invitations:runtime.sponsorInvitations.list(actor),cities:eligible},{headers});
  if(body.action==="revoke")return Response.json({invitation:runtime.sponsorInvitations.revoke(body.id,actor)},{headers});
  const city=eligible.find(item=>item.id===body.cityId);if(!city)throw new Error("Choose an active Pro city that you own and finish its payout setup first.");
  return Response.json({invitation:runtime.sponsorInvitations.create({id:body.id,token:body.token,cityId:city.id,cityName:city.name,hostPubkey:actor,payoutVersion:city.payoutVersion,expiresAt:body.expiresAt,authorizationEvent:JSON.stringify(body.event)})},{headers});
 }catch(error){const message=error instanceof Error?error.message:"Sponsor invitation unavailable.";return Response.json({error:/^(Choose|Sponsor invitation|Connect your host)/.test(message)?message:"Sponsor invitation evidence could not be verified."},{status:409,headers});}
}
