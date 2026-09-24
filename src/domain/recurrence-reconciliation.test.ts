import {describe,expect,it} from "vitest";
import type {Event} from "nostr-tools";
import {reconcileOccurrences} from "./recurrence-reconciliation";
import {upcomingDrafts,type RecurringPlan} from "./rolling-drafts";
import type {ManagedCalendarEvent} from "./event-routing";

const now=Date.parse("2026-10-01T00:00:00Z");
const plan:RecurringPlan={version:1,owner:"a".repeat(64),cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",seriesId:"77f137cb-2ac1-4eef-8358-7dd66b45922f",firstDate:"2026-10-03",localTime:"10:00",timeZone:"America/Chicago",frequency:"weekly",weekday:6,paused:false,skippedDates:[],meetingPoint:{description:"Square",latitude:35.15,longitude:-90.05}};
const drafts=upcomingDrafts(plan,now);
function published(start:number,id:string):ManagedCalendarEvent {
  return {event:{id} as Event,start,end:start+3600,timeZone:plan.timeZone,meetingPoint:plan.meetingPoint,status:"upcoming"};
}

describe("recurring walk reconciliation",()=>{
  it("proposes only missing dates from the next eight",()=>{
    const rows=drafts.slice(0,7).map((draft,index)=>published(draft.start,String(index)));
    const result=reconcileOccurrences(drafts,rows,plan.timeZone,now);
    expect(result.covered).toHaveLength(7);
    expect(result.missing.map(draft=>draft.localDate)).toEqual([drafts[7].localDate]);
  });
  it("counts two events on one date once and flags the conflict",()=>{
    const rows=[published(drafts[0].start,"one"),published(drafts[0].start,"two")];
    const result=reconcileOccurrences(drafts,rows,plan.timeZone,now);
    expect(result.covered).toHaveLength(1);
    expect(result.missing).toHaveLength(7);
    expect(result.scheduledFutureDates).toBe(1);
    expect(result.multipleDates).toEqual([drafts[0].localDate]);
  });
  it("does not suggest another event when that date has a different published time",()=>{
    const result=reconcileOccurrences(drafts,[published(drafts[0].start+3600,"later")],plan.timeZone,now);
    expect(result.covered).toHaveLength(1);
    expect(result.timeConflicts).toEqual([drafts[0].localDate]);
  });
  it("ignores past events, including the active walk, when filling future dates",()=>{
    const result=reconcileOccurrences(drafts,[published(Math.floor(now/1000)-30,"past")],plan.timeZone,now);
    expect(result.missing).toHaveLength(8);
    expect(result.scheduledFutureDates).toBe(0);
  });
  it("uses the city timezone rather than the browser timezone around DST",()=>{
    const result=reconcileOccurrences(drafts,[published(drafts[5].start,"winter")],plan.timeZone,now);
    expect(result.covered.map(draft=>draft.localDate)).toEqual(["2026-11-07"]);
  });
});
