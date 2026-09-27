import type {Event} from "nostr-tools";
import type {CityDirectoryDiscovery} from "../nostr/city-directory";

export type DirectoryRootSubmissionPlan=
  |{kind:"create"}
  |{kind:"verify-existing";event:Event}
  |{kind:"recover-existing";event:Event};

export type DirectoryRootResult={event:Event;outcome:"created"|"verified"|"recovered"};

export function planDirectoryRootSubmission(discovery:CityDirectoryDiscovery):DirectoryRootSubmissionPlan{
  if(!discovery.root)return {kind:"create"};
  return discovery.unavailableRelays.length
    ?{kind:"verify-existing",event:discovery.root}
    :{kind:"recover-existing",event:discovery.root};
}

export function directoryRootResultHeading(outcome:DirectoryRootResult["outcome"]){
  if(outcome==="verified")return "Existing trust anchor verified";
  if(outcome==="recovered")return "Existing trust anchor recovered";
  return "Trust anchor created";
}
