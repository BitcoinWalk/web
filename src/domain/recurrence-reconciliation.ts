import type {LocatedOccurrence} from "./event-location";
import type {ManagedCalendarEvent} from "./event-routing";

function localDate(start:number,timeZone:string):string {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(start*1000)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Count distinct future city dates, never raw events. One published date blocks
 * another automatic proposal even if its time differs from the saved plan. */
export function reconcileOccurrences(drafts:LocatedOccurrence[],published:ManagedCalendarEvent[],timeZone:string,now=Date.now()) {
  if(!Number.isFinite(now))throw new Error("Invalid current time.");
  const byDate=new Map<string,ManagedCalendarEvent[]>();
  for(const item of published){
    if(item.start*1000<=now)continue;
    const date=localDate(item.start,timeZone);
    const rows=byDate.get(date)??[];
    rows.push(item);byDate.set(date,rows);
  }
  const missing=drafts.filter(draft=>!byDate.has(draft.localDate));
  const covered=drafts.filter(draft=>byDate.has(draft.localDate));
  const multipleDates=[...byDate].filter(([,rows])=>rows.length>1).map(([date])=>date).sort();
  const timeConflicts=drafts.filter(draft=>{
    const rows=byDate.get(draft.localDate);
    return rows?.length&&!rows.some(row=>row.start===draft.start);
  }).map(draft=>draft.localDate);
  return {missing,covered,multipleDates,timeConflicts,scheduledFutureDates:byDate.size};
}
