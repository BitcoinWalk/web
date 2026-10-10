import {getEventHash,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {createCityActivation,verifyCityActivation} from "../rustress/activation-contract";
import {managedProvisionConfigSchema,provisionConfigSchema} from "../rustress/contract";
import {SUPER_ADMIN_PUBKEY} from "./authority";
import {MADEIRA_PILOT} from "./madeira-pilot";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
export const MADEIRA_MANAGED_ACTIVATION="madeira-managed-public-activation-v1" as const;
export const madeiraManagedActivationChallengeSchema=z.object({
  scope:z.literal(MADEIRA_MANAGED_ACTIVATION),cityId:z.literal(MADEIRA_PILOT.cityId),pubkey:z.literal(MADEIRA_PILOT.pubkey),
  origin:z.literal(MADEIRA_PILOT.origin),publicOrigin:z.literal("https://bitcoinwalk.org"),requestId:z.uuid(),
  reservationRequestId:z.uuid(),reservationProofHash:hex,issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),providerRevision:hex,
  nip05:z.literal("madeira@bitcoinwalk.org"),lightningAddress:z.literal("madeira@bitcoinwalk.org"),publicActivation:z.literal(true),
  organizerBasisPoints:z.literal(7900),retainedBasisPoints:z.literal(2100),reserved:provisionConfigSchema,activation:managedProvisionConfigSchema,
}).strict().superRefine((value,ctx)=>{
  try{
    const activation=verifyCityActivation(value.reserved,value.activation),expected=createCityActivation(value.reserved);
    if(JSON.stringify(activation)!==JSON.stringify(expected)||activation.cityId!==value.cityId||activation.brandPubkey!==value.pubkey||
      activation.localPart!=="madeira"||activation.domain!=="bitcoinwalk.org"||activation.walletRef!=="bitcoinwalk-rustress"||
      activation.organizerBasisPoints!==value.organizerBasisPoints||activation.retainedBasisPoints!==value.retainedBasisPoints)
      throw new Error();
  }catch{ctx.addIssue({code:"custom",message:"Invalid Madeira public activation transition"});}
});
export type MadeiraManagedActivationChallenge=z.infer<typeof madeiraManagedActivationChallengeSchema>;
export type MadeiraManagedActivationRole="owner"|"admin";

export function madeiraManagedActivationProofTemplate(challenge:MadeiraManagedActivationChallenge,role:MadeiraManagedActivationRole):EventTemplate{
  const checked=madeiraManagedActivationChallengeSchema.parse(challenge);
  return {kind:27235,created_at:checked.issuedAt,tags:[
    ["u",`${MADEIRA_PILOT.origin}/api/madeira-pilot`],["t",MADEIRA_MANAGED_ACTIVATION],["role",role],
  ],content:JSON.stringify(checked)};
}

export function verifyMadeiraManagedActivationProof(input:Event,challenge:MadeiraManagedActivationChallenge,
  role:MadeiraManagedActivationRole,now:number,stored=false){
  const event:Event=JSON.parse(JSON.stringify(input)),template=madeiraManagedActivationProofTemplate(challenge,role);
  if(challenge.expiresAt!==challenge.issuedAt+3600||now<challenge.issuedAt||(!stored&&now>=challenge.expiresAt)||
    event.pubkey!==(role==="owner"?MADEIRA_PILOT.pubkey:SUPER_ADMIN_PUBKEY)||event.kind!==template.kind||event.created_at!==template.created_at||
    event.content!==template.content||JSON.stringify(event.tags)!==JSON.stringify(template.tags)||getEventHash(event)!==event.id||!verifyEvent(event))
    throw new Error("Managed public activation proof is invalid or expired.");
  return event;
}
