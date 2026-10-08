// Read-only readiness check. Never constructs the pilot store or payment runtime.
import {DatabaseSync} from "node:sqlite";
import {userInfo} from "node:os";
import {madeiraPilotEnabled,resolveMadeiraPilotSnapshot} from "../src/server/madeira-pilot";
import {MADEIRA_PILOT} from "../src/nostr/madeira-pilot";
async function main(){
  if(userInfo().username!=="bitcoinwalk"||!madeiraPilotEnabled())throw new Error("Exact non-root staging environment required.");
  const db=new DatabaseSync("/var/lib/bitcoinwalk-app-staging/payments.sqlite",{readOnly:true});
  try{
    const evidence=await resolveMadeiraPilotSnapshot(db);
    const invoices=db.prepare("SELECT status FROM payment_invoice WHERE cityId=?").all(MADEIRA_PILOT.cityId);
    const paid=db.prepare("SELECT count(*) count FROM paid_city_entitlement WHERE cityId=?").get(MADEIRA_PILOT.cityId);
    console.log(JSON.stringify({cityId:MADEIRA_PILOT.cityId,approvalVerified:true,existingAccountVerified:true,payoutSignatureVerified:true,payoutEndpointVerified:true,payoutVersion:evidence.payoutVersion,invoices,paidEntitlements:paid?.count}));
  }finally{db.close();}
}
main().then(()=>process.exit(0)).catch(()=>{console.error("Madeira read-only preflight failed; no changes made. Review approval, authority and saved payout evidence.");process.exit(1);});
