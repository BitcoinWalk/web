import {createHash} from "node:crypto";
import {nip19} from "nostr-tools";
import {organizerProNextActions} from "../payments/organizer-pro-next-action";
import {loadPublicEventsFeed,type PublicEventsFeed} from "../server/public-events-feed";
import {inQuietHours,WebNotificationService,type NotificationCandidate} from "./web-notification-service";
import {WebPushStore} from "./web-push-store";

const workflowCopy={
 "confirm-payout":"Confirm the Lightning payout destination for this city.",
 "connect-city-signer":"Connect and back up the separate city signer.",
 "submit-activation":"Submit the completed city setup for activation.",
 "awaiting-review":"BitcoinWalk is reviewing the submitted city setup.",
 "awaiting-publication":"The approved city setup is waiting for public publication.",
} as const;

export function scanCandidates(store:WebPushStore,feed:PublicEventsFeed,now=Math.floor(Date.now()/1000)):NotificationCandidate[]{
 const candidates:NotificationCandidate[]=[],walkOwners=new Set(store.owners("walk-reminder"));
 for(const event of feed.events){
  const start=Math.floor(new Date(event.startDate).getTime()/1000);if(!event.organizerNpub||start<=now||start>now+86400)continue;
  let owner="";try{const decoded=nip19.decode(event.organizerNpub);if(decoded.type==="npub")owner=decoded.data;}catch{}if(!walkOwners.has(owner))continue;
  const path=new URL(event.link).pathname,when=new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:event.timeZone}).format(new Date(start*1000));
  candidates.push({ownerPubkey:owner,dedupeKey:`walk-24h:${event.id}`,category:"walk-reminder",title:`Next walk: ${event.name}`,body:`${when} · ${event.address}`,path,tag:`walk-${event.id.slice(0,20)}`});
 }
 for(const owner of store.owners("workflow"))for(const action of organizerProNextActions(store.db,owner,now))candidates.push({ownerPubkey:owner,dedupeKey:`pro:${action.cityId}:${action.state}`,category:"workflow",title:`${action.cityName} needs your attention`,body:workflowCopy[action.state],path:`/admin/pro-setup?city=${encodeURIComponent(action.cityId)}`,tag:`pro-${action.cityId.slice(0,20)}`});
 return candidates.sort((a,b)=>a.ownerPubkey.localeCompare(b.ownerPubkey)||a.dedupeKey.localeCompare(b.dedupeKey));
}

export async function runNotificationScan(store:WebPushStore,feed?:PublicEventsFeed,now=Math.floor(Date.now()/1000)){
 const service=new WebNotificationService(store,undefined,()=>now),candidates=scanCandidates(store,feed??await loadPublicEventsFeed(),now),outcomes=[];
 for(const candidate of candidates)outcomes.push(await service.send(candidate));
 return {checkedAt:now,candidates:candidates.length,created:outcomes.filter(outcome=>outcome.created).length,sent:outcomes.reduce((sum,outcome)=>sum+outcome.sent,0),deferred:outcomes.reduce((sum,outcome)=>sum+outcome.deferred,0),failed:outcomes.reduce((sum,outcome)=>sum+outcome.failed,0)};
}

export async function previewNotificationScan(store:WebPushStore,feed?:PublicEventsFeed,now=Math.floor(Date.now()/1000)){
 const candidates=scanCandidates(store,feed??await loadPublicEventsFeed(),now);
 return {checkedAt:now,readOnly:true,candidates:candidates.map(candidate=>{const notice=store.noticeByDedupe(candidate.ownerPubkey,candidate.dedupeKey),devices=store.rawDevices(candidate.ownerPubkey).filter(device=>candidate.category==="walk-reminder"?device.preferences.walkReminders:device.preferences.workflowUpdates);return {recipient:createHash("sha256").update(candidate.ownerPubkey).digest("hex").slice(0,12),trigger:candidate.category==="walk-reminder"?"Verified organizer walk starts within 24 hours":"Organizer Pro setup requires action",category:candidate.category,title:candidate.title,body:candidate.body,path:candidate.path,deduplication:notice?{state:"existing",pushState:notice.pushState,createdAt:notice.createdAt}:{state:"new"},devices:devices.map(device=>{const delivery=notice?store.delivery(notice.id,device.id):undefined,quiet=inQuietHours(device.preferences,now);return {device:createHash("sha256").update(device.id).digest("hex").slice(0,8),timeZone:device.preferences.timeZone,quiet,state:delivery?.state??"not-created",nextAttemptAt:delivery?.nextAttemptAt??null,outcome:delivery?.state==="sent"?"already-sent":quiet?"would-defer":delivery&&delivery.nextAttemptAt>now?"retry-wait":"ready"};})};})};
}
