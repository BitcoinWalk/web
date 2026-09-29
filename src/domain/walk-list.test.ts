import {describe,it,expect} from "vitest";
import {DEFAULT_WALK_LIST_STATUSES,groupWalkRows,type WalkListStatus} from "./walk-list";
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
});
