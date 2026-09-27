import {type Event} from "nostr-tools";
import {parseMediaRequest} from "../domain/media-request";
import {isSuperAdmin} from "../nostr/authority";

export function isReplicationStatusRequester(event:Event):boolean {
 const command=parseMediaRequest(event);
 if(command?.action!=="list-replication-status")return false;
 if(isSuperAdmin(event.pubkey))return true;
 const guide=process.env.BITCOINWALK_GUIDE_PUBKEY;
 return Boolean(guide&&/^[0-9a-f]{64}$/.test(guide)&&event.pubkey===guide);
}
