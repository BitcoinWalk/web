import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {SUPER_ADMIN_PUBKEY} from "./authority";
import {MADEIRA_PILOT,type MadeiraSnapshot} from "./madeira-pilot";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
export const MADEIRA_MANAGED_RESERVATION="madeira-managed-reservation-v1" as const;
export const madeiraManagedChallengeSchema=z.object({
  scope:z.literal(MADEIRA_MANAGED_RESERVATION),cityId:z.literal(MADEIRA_PILOT.cityId),pubkey:z.literal(MADEIRA_PILOT.pubkey),
  origin:z.literal(MADEIRA_PILOT.origin),requestId:z.uuid(),issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),
  providerRevision:hex,localPart:z.literal("madeira"),walletRef:z.literal("bitcoinwalk-rustress"),
  invoiceIssuance:z.literal("disabled"),publicActivation:z.literal(false),organizerBasisPoints:z.literal(7900),retainedBasisPoints:z.literal(2100),
  snapshot:z.object({revisionId:hex,approvalEventId:hex,authorityEventId:hex,payoutVersion:z.number().int().positive(),payoutDestination:z.string().min(3).max(500)}).strict(),
}).strict();
export type MadeiraManagedChallenge=z.infer<typeof madeiraManagedChallengeSchema>;
export type MadeiraManagedRole="owner"|"admin";
export function madeiraManagedProofTemplate(challenge:MadeiraManagedChallenge,role:MadeiraManagedRole):EventTemplate{
  const checked=madeiraManagedChallengeSchema.parse(challenge);
  return {kind:27235,created_at:checked.issuedAt,tags:[["u",`${MADEIRA_PILOT.origin}/api/madeira-pilot`],["t",MADEIRA_MANAGED_RESERVATION],["role",role]],content:JSON.stringify(checked)};
}
export function verifyMadeiraManagedProof(input:Event,challenge:MadeiraManagedChallenge,role:MadeiraManagedRole,now:number,stored=false){
  const event:Event=JSON.parse(JSON.stringify(input)),template=madeiraManagedProofTemplate(challenge,role);
  if(challenge.expiresAt!==challenge.issuedAt+3600||now<challenge.issuedAt||(!stored&&now>=challenge.expiresAt)||
    event.pubkey!==(role==="owner"?MADEIRA_PILOT.pubkey:SUPER_ADMIN_PUBKEY)||event.kind!==template.kind||event.created_at!==template.created_at||
    event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags)||getEventHash(event)!==event.id||!verifyEvent(event))
    throw new Error("Managed reservation proof is invalid or expired.");
  return event;
}
export function managedSnapshot(value:MadeiraSnapshot){return madeiraManagedChallengeSchema.shape.snapshot.parse(value);}
