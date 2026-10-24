import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {verifyEvent,type Event} from "nostr-tools";
import {z} from "zod";
import type {PayoutDestinationVersion} from "./payout-destination-store";
import {sponsorPayoutOrderScopeSchema,type SponsorPayoutOrderScope} from "./sponsor-payout-operation";
import {normalizePayoutDestination} from "../server/lnurl-pay";

export function sponsorDestinationFingerprint(destination:PayoutDestinationVersion){
 return createHash("sha256").update(`${destination.cityId}:${destination.version}:${destination.normalized}`).digest("hex");
}

/** Reads the canonical checkout DB, never a browser-supplied obligation or a
 * copied export. A later invitation revocation cannot erase a settled debt. */
export function requireSponsorPayoutOrder(db:DatabaseSync,scope:SponsorPayoutOrderScope,cityId:string){
 sponsorPayoutOrderScopeSchema.parse(scope);z.uuid().parse(cityId);
 const money=z.string().regex(/^(0|[1-9][0-9]{0,15})$/),hex=z.string().regex(/^[0-9a-f]{64}$/);
 const obligation=z.object({orderId:z.uuid(),invitationId:z.uuid(),cityId:z.uuid(),hostPubkey:hex,payoutVersion:z.number().int().positive(),receivedMsat:money,hostMsat:money,retainedMsat:money,state:z.enum(["owed","unknown","paid"])}).parse(db.prepare("SELECT * FROM sponsorship_host_obligation WHERE orderId=?").get(scope.orderId));
 if(BigInt(obligation.receivedMsat)<=0n||BigInt(obligation.hostMsat)!==BigInt(obligation.receivedMsat)*79n/100n||BigInt(obligation.hostMsat)+BigInt(obligation.retainedMsat)!==BigInt(obligation.receivedMsat))throw new Error("Sponsor split unavailable");
 const order=db.prepare("SELECT * FROM sponsorship_order WHERE id=?").get(scope.orderId);
 if(!obligation||!order||order.status!=="paid"||order.invitationOrigin!=="host"||order.paymentHash!==scope.paymentHash||
  order.cityId!==cityId||obligation.cityId!==cityId||order.invitationId!==obligation.invitationId||
  order.hostPubkey!==scope.hostPubkey||obligation.hostPubkey!==scope.hostPubkey||order.payoutVersion!==scope.payoutVersion||obligation.payoutVersion!==scope.payoutVersion||
  order.hostBasisPoints!==7900||order.retainedBasisPoints!==2100||String(order.amountMsat)!==scope.receivedMsat||obligation.receivedMsat!==scope.receivedMsat||
  !Number.isSafeInteger(order.settledAt)||Number(order.settledAt)<Number(order.createdAt))throw new Error("Sponsor order authority unavailable");
 const invitation=db.prepare("SELECT * FROM sponsorship_invitation WHERE id=?").get(obligation.invitationId);
 if(!invitation||invitation.cityId!==cityId||invitation.hostPubkey!==scope.hostPubkey||invitation.payoutVersion!==scope.payoutVersion)throw new Error("Sponsor invitation binding unavailable");
 const invitationEvent=JSON.parse(String(invitation.authorizationEvent)) as Event,invitationCommand=JSON.parse(invitationEvent.content);
 if(!verifyEvent({...invitationEvent})||invitationEvent.pubkey!==scope.hostPubkey||invitationEvent.kind!==27235||invitationCommand.action!=="create"||
  invitationCommand.id!==invitation.id||invitationCommand.cityId!==cityId||invitationCommand.tokenHash!==invitation.tokenHash||invitationCommand.expiresAt!==invitation.expiresAt||invitationCommand.walkId!==invitation.walkId||
  Number(order.createdAt)<Number(invitation.createdAt)||Number(order.createdAt)>=Number(invitation.expiresAt)||invitation.revokedAt!==null&&Number(invitation.revokedAt)<=Number(order.createdAt))throw new Error("Sponsor invitation signature unavailable");
 if(invitation.walkId!==null){const walks=z.array(z.object({id:z.string()})).length(1).parse(JSON.parse(String(order.walks)));if(walks[0].id!==invitation.walkId)throw new Error("Sponsor walk binding unavailable");}
 const row=db.prepare("SELECT * FROM payout_destination_version WHERE city_id=? AND version=?").get(cityId,scope.payoutVersion);
 if(!row||row.owner_pubkey!==scope.hostPubkey)throw new Error("Sponsor destination unavailable");
 const destination:PayoutDestinationVersion={cityId,version:scope.payoutVersion,ownerPubkey:scope.hostPubkey,normalized:String(row.normalized),endpoint:String(row.endpoint),callback:String(row.callback),minSendable:Number(row.min_sendable),maxSendable:Number(row.max_sendable),confirmedAt:Number(row.confirmed_at)};
 const event=JSON.parse(String(row.owner_event)) as Event,command=JSON.parse(event.content);
 if(!verifyEvent({...event})||event.id!==row.owner_event_id||event.pubkey!==scope.hostPubkey||event.kind!==27235||command.action!=="save-payout"||command.cityId!==cityId||
  typeof command.destination!=="string"||normalizePayoutDestination(command.destination).normalized!==destination.normalized||sponsorDestinationFingerprint(destination)!==scope.destinationFingerprint)throw new Error("Sponsor destination confirmation unavailable");
 return {obligation,destination};
}
