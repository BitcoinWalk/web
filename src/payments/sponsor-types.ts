export const SPONSOR_PACKAGES=[{count:1,sats:21000},{count:2,sats:42000},{count:5,sats:69000}] as const;
export const DEFAULT_SPONSOR_WALK_SATS=SPONSOR_PACKAGES[0].sats,MIN_SPONSOR_WALK_SATS=1_000,MAX_SPONSOR_WALK_SATS=10_000_000;
export function validSponsorWalkSats(value:number){return Number.isSafeInteger(value)&&value>=MIN_SPONSOR_WALK_SATS&&value<=MAX_SPONSOR_WALK_SATS;}
export type SponsorWalk={id:string;address:string;start:number;label:string;sats?:number};
export function sponsorWalkSats(walk:Pick<SponsorWalk,"sats">){return validSponsorWalkSats(walk.sats??DEFAULT_SPONSOR_WALK_SATS)?walk.sats??DEFAULT_SPONSOR_WALK_SATS:DEFAULT_SPONSOR_WALK_SATS;}
export type SponsorCity={id:string;name:string;slug:string;walks:SponsorWalk[]};
export type SponsorPayoutPolicy={origin:"platform";hostBasisPoints:0;retainedBasisPoints:10000}|{origin:"host";invitationId:string;hostPubkey:string;payoutVersion:number;hostBasisPoints:7900;retainedBasisPoints:2100};
export type SponsorOrder={id:string;cityId:string;cityName:string;count:number;amountMsat:number;walks:SponsorWalk[];status:string;invoice:string;paymentHash:string|null;createdAt:number;expiresAt:number;settledAt:number|null;recoveryAcknowledgedAt:number|null;pubkey:string|null;logoHash:string|null;draftName:string|null;draftWebsite:string|null;needsReview:boolean;payoutPolicy:SponsorPayoutPolicy};
