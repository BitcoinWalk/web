import type { PaidDirectoryCity } from "../domain/directory";

// Operator-confirmed legacy entitlements only. Neither requestedTier, a sponsor
// nor an organizer's chat URL is proof of payment. New settled app purchases
// remain in the payment ledger; staging pilots are never promoted by this list.
export const directoryConfig:{paidCities:Record<string,PaidDirectoryCity>}={paidCities:{
  "ca2f9905-fb4d-4948-a12c-c792b28ec7c8":{slug:"london",featured:false,subdomainReady:true},
  "8e136ccb-923b-41aa-a6d1-1290b0b3a014":{slug:"wurzburg",featured:false,subdomainReady:false},
}};
