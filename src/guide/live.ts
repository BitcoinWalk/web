import {type Event} from "nostr-tools";
import {matchesInitialCalendar} from "../nostr/calendar-records";
import {type ApprovalRecord,type CityRevision} from "../nostr/city-records";
import {managedCities} from "../nostr/moderation";
import {type LivePublication} from "./outbox";

export function verifiedLivePublications(revisions:CityRevision[],decisions:ApprovalRecord[],calendarEvents:Event[]):LivePublication[]{
 return managedCities(revisions,decisions).filter(city=>city.state==="approved").flatMap(city=>{
  const approval=city.decision,initialID=approval.approval.initialEventId;
  if(!initialID)return [];
  const event=calendarEvents.find(item=>item.id===initialID);
  return event&&matchesInitialCalendar(event,{revision:city.revision,approval})?[{revision:city.revision,approval,event}]:[];
 });
}
