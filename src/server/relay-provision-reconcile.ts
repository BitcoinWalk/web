import {directoryConfig} from "../lib/directory-config";
import {serverReadRelays} from "../lib/server-relay-config";
import {queryDirectoryRecords,type ApprovalRecord,type CityRevision} from "../nostr/city-records";
import {managedCities} from "../nostr/moderation";
import {getPaymentRuntime} from "../payments/runtime";
import {RelayProvisionStore,type RelayProvisionTask} from "../relay-provisioning/store";
import {isSilentActiveOverride} from "../domain/admin-city-requests";

type DirectorySnapshot={revisions:CityRevision[];approvals:ApprovalRecord[]};
type PaymentAccess={entitled:(cityId:string)=>boolean;db:ConstructorParameters<typeof RelayProvisionStore>[0]};

/** Queue exact paid approvals, including cities approved before this worker existed. */
export function queueApprovedPaidCityRelays(payment:PaymentAccess,snapshot:DirectorySnapshot):RelayProvisionTask[]{
 const queue=new RelayProvisionStore(payment.db),tasks:RelayProvisionTask[]=[];
 for(const row of managedCities(snapshot.revisions,snapshot.approvals)){
  const city=row.revision.city,approval=row.decision.approval;
  if(row.state!=="approved"||isSilentActiveOverride(approval.note)||!payment.entitled(city.cityId)||directoryConfig.paidCities[city.cityId]?.subdomainReady)continue;
  tasks.push(queue.enqueue({cityId:city.cityId,revisionId:row.revision.event.id,slug:approval.slug??city.slug,cityName:city.cityName,approvalEventId:row.decision.event.id}));
 }
 return tasks;
}

export async function reconcilePaidCityRelays():Promise<number>{
 if(process.env.BITCOINWALK_RELAY_PROVISION_ENABLED!=="1")return 0;
 const payment=getPaymentRuntime().store,snapshot=await queryDirectoryRecords(serverReadRelays());
 return queueApprovedPaidCityRelays(payment,snapshot).length;
}
