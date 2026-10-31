import {queryAuthorizations,queryCalendarEvents,queryDirectoryRecords,queryRelayEvents} from "../nostr/city-records";
import {approvedCalendarWalks} from "../nostr/calendar-records";
import {managedCalendarEvents} from "../domain/event-routing";
import {cityOwnerPubkey} from "../domain/city";
import {latestCityGrants} from "../nostr/editor-management";
import {EVENT_MODERATION_KIND,latestEventModerations,latestOrganizerModeration,parseEventModeration} from "../nostr/event-moderation";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {serverReadRelays} from "../lib/server-relay-config";
import type {IdleReminderPreferences} from "./idle-reminder-preferences";
import type {IdleSnapshot} from "../guide/idle-contract";

/** No public Hosted-by identity or partial feed may decide a private recipient. */
export async function idleReminderSnapshot(preferences:IdleReminderPreferences,now=Math.floor(Date.now()/1000)):Promise<IdleSnapshot>{
 const relays=serverReadRelays();
 const [{revisions,approvals},authorizations,moderationEvents]=await Promise.all([queryDirectoryRecords(relays),queryAuthorizations(relays),queryRelayEvents(relays,[EVENT_MODERATION_KIND],undefined,{authors:[SUPER_ADMIN_PUBKEY]})]);
 if(moderationEvents.length>=500)throw Error("Incomplete moderation snapshot.");
 const moderation=moderationEvents.map(parseEventModeration);
 if(moderation.some(row=>row===null))throw Error("Unverified moderation snapshot.");
 const records=moderation.filter(row=>row!==null),latest=latestEventModerations(records),grants=new Map(latestCityGrants(authorizations).map(row=>[row.grant.cityId,row.grant]));
 const walks=approvedCalendarWalks(revisions,approvals),events=walks.length?await queryCalendarEvents(relays,{cityIds:walks.map(walk=>walk.revision.city.cityId)}):[];
 if(events.length>=500)throw Error("Incomplete calendar snapshot.");
 const cities=walks.flatMap(walk=>{
  const city=walk.revision.city,grant=grants.get(city.cityId);if(!grant)return [];
  const recipient=cityOwnerPubkey(grant),preference=preferences.read(city.cityId,recipient);
  const suspended=latestOrganizerModeration(records,recipient)?.decision.status==="suspended"||latest.some(row=>row.decision.cityId===city.cityId&&row.decision.scope==="city"&&row.decision.status==="suspended");
  return [{cityId:city.cityId,cityName:city.cityName,recipient,empty:!managedCalendarEvents(walk,events,now).some(item=>item.status!=="past"),allowed:!suspended&&preference.enabled&&preference.snooze<=now,preferenceVersion:preference.version}];
 });
 return {version:1,checkedAt:now,paused:process.env.BITCOINWALK_IDLE_REMINDERS_ENABLED!=="true",cities};
}
