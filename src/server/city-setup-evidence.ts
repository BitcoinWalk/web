import type {Event} from "nostr-tools";
import {queryAuthorizations,queryDirectoryRecords,queryRelayEvents} from "../nostr/city-records";
import {CITY_DIRECTORY_KIND,discoverCityDirectoryChainForSigning,discoverExistingCityDirectoryRoot} from "../nostr/city-directory";
import {latestEventModerations,organizerPublishingStatus,queryEventModerations} from "../nostr/event-moderation";
import {serverReadRelays} from "../lib/server-relay-config";
import {relayConfig} from "../lib/relay-config";

/** Read-only authority checks shared by paid setup and the isolated pilot.
 * No wallet, payment runtime, media generation or provider writes. */
export const citySetupEvidence={
  snapshot:()=>queryDirectoryRecords(serverReadRelays()),
  grants:()=>queryAuthorizations(serverReadRelays()),
  discover:async(cityId:string,creator:string)=>{
    const read=async(relay:string,id:string):Promise<Event[]>=>{
      const events=await queryRelayEvents([relay],[CITY_DIRECTORY_KIND],undefined,{"#i":[id],limit:500});
      if(events.length>=500)throw new Error("City directory history is incomplete.");
      return events;
    };
    const discovery=await discoverExistingCityDirectoryRoot(relayConfig.directoryRelays,cityId,creator,read);
    if(!discovery.root)return null;
    const {state}=await discoverCityDirectoryChainForSigning(relayConfig.directoryRelays,{cityId,rootEventId:discovery.root.id,initialOwnerPubkey:creator},read);
    return {ownerPubkey:state.content.ownerPubkey,eventId:state.currentEvent.id};
  },
  restrictions:async(cityId:string,owner:string)=>{
    const [records,status]=await Promise.all([queryEventModerations(serverReadRelays(),cityId),organizerPublishingStatus(serverReadRelays(),owner)]);
    return status==="suspended"||latestEventModerations(records).some(row=>row.decision.status==="suspended"&&(row.decision.scope==="city"||row.decision.scope==="author"&&row.decision.target===owner));
  },
};
