import {describe,it,expect} from "vitest";
import {DEFAULT_WALK_LIST_STATUSES,filterWalkRows,groupWalkRows,type WalkListStatus} from "./walk-list";
import type {CalendarWalk} from "../nostr/calendar-records";
const walk={revision:{city:{cityId:"norilsk",cityName:"Norilsk"}}} as CalendarWalk;
const rows=[
  {kind:"canceled" as const,key:"canceled",at:30,walk},
  {kind:"upcoming" as const,key:"hosted",at:20,walk,hosted:true},
  {kind:"past" as const,key:"past",at:1,walk},
  {kind:"draft" as const,key:"draft",at:10,walk},
];
describe("unified walk list filters",()=>{
  it("defaults to upcoming and draft, sorted chronologically, retaining hosted context",()=>{
    const group=groupWalkRows(rows,new Set(DEFAULT_WALK_LIST_STATUSES))[0][1];
    expect(group.rows.map(row=>row.key)).toEqual(["draft","hosted"]);
    expect(group.rows[1]).toMatchObject({hosted:true});
  });
  it.each<WalkListStatus>(["past","draft","upcoming","canceled"])("isolates the %s filter",kind=>{
    expect(groupWalkRows(rows,new Set([kind]))[0][1].rows.map(row=>row.kind)).toEqual([kind]);
  });
  it("combines filters, permits an empty selection and never mutates source rows",()=>{
    expect(groupWalkRows(rows,new Set(["past","canceled"]))[0][1].rows.map(row=>row.key)).toEqual(["past","canceled"]);
    expect(groupWalkRows(rows,new Set())).toEqual([]);
    expect(rows[0].key).toBe("canceled");
  });
  it("offers all, upcoming and past views without mutating the source",()=>{
    expect(filterWalkRows(rows,"all").map(row=>row.key)).toEqual(["canceled","hosted","past","draft"]);
    expect(filterWalkRows(rows,"upcoming").map(row=>row.key)).toEqual(["hosted"]);
    expect(filterWalkRows(rows,"past").map(row=>row.key)).toEqual(["past"]);
    expect(rows[0].key).toBe("canceled");
  });
  it("returns the nearest published non-past walk from every city",()=>{
    const another={revision:{city:{cityId:"warszawa",cityName:"Warszawa"}}} as CalendarWalk;
    const candidates=[...rows,{kind:"upcoming" as const,key:"later",at:40,walk},{kind:"upcoming" as const,key:"warszawa",at:50,walk:another}];
    expect(filterWalkRows(candidates,"next").map(row=>row.key).sort()).toEqual(["hosted","warszawa"]);
  });
});
