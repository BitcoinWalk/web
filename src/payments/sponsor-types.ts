export const SPONSOR_PACKAGES=[{count:1,sats:21000},{count:2,sats:42000},{count:5,sats:69000}] as const;
export type SponsorWalk={id:string;address:string;start:number;label:string};
export type SponsorCity={id:string;name:string;slug:string;walks:SponsorWalk[]};
export type SponsorOrder={id:string;cityId:string;cityName:string;count:number;amountMsat:number;walks:SponsorWalk[];status:string;invoice:string;paymentHash:string|null;createdAt:number;expiresAt:number;settledAt:number|null;pubkey:string|null;needsReview:boolean};
