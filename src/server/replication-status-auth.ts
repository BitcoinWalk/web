import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../domain/media-request";
import {isSuperAdmin} from "../nostr/authority";

export function isGuideRequester(event:Event,action:"list-replication-status"|"list-directory-notifications"):boolean {
 const command=parseMediaRequest(event);
 if(command?.action!==action)return false;
 if(isSuperAdmin(event.pubkey))return true;
 const guide=process.env.BITCOINWALK_GUIDE_PUBKEY;
 return Boolean(guide&&/^[0-9a-f]{64}$/.test(guide)&&event.pubkey===guide);
}
export function isReplicationStatusRequester(event:Event):boolean{return isGuideRequester(event,"list-replication-status");}
