import { describe, expect, it } from "vitest";
import { upcomingDrafts, readRecurringPlan, saveRecurringPlan, type RecurringPlan } from "./rolling-drafts";
const plan: RecurringPlan = { version: 1, owner: "a".repeat(64), cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", seriesId: "77f137cb-2ac1-4eef-8358-7dd66b45922f", firstDate: "2026-10-03", localTime: "10:00", timeZone: "America/Chicago", frequency: "weekly", weekday: 6, paused: false, skippedDates: [], meetingPoint: { description: "Square", latitude: 35.15, longitude: -90.05 } };
const now = Date.parse("2026-10-01T00:00:00Z");
describe("rolling eight-walk drafts", () => {
  it("shows a readable error for missing or invalid start dates without writing storage", () => {
    let writes = 0;
    const storage = { getItem: () => null, setItem: () => { writes++; } };
    for (const firstDate of ["", "2026-02-30", "20/09/2026", "2026-9-20"]) {
      const invalid = { ...plan, firstDate };
      expect(() => upcomingDrafts(invalid, now)).toThrow("Choose a valid start date using the date picker (2000–2099).");
      expect(() => saveRecurringPlan(storage, invalid)).toThrow("Choose a valid start date");
    }
    expect(writes).toBe(0);
  });
  it("tops up one new date after the first walk starts, preserving the other IDs", () => {
    const first = upcomingDrafts(plan, now);
    const next = upcomingDrafts(plan, first[0].start * 1000);
    expect(first).toHaveLength(8); expect(next).toHaveLength(8);
    expect(next.slice(0, 7).map(o => o.id)).toEqual(first.slice(1).map(o => o.id));
    expect(next[7].localDate).toBe("2026-11-28");
  });
  it("catches up after many missed logins without duplicating dates", () => {
    const drafts = upcomingDrafts(plan, Date.parse("2027-02-01"));
    expect(drafts).toHaveLength(8); expect(drafts[0].localDate).toBe("2027-02-06");
    expect(new Set(drafts.map(d => d.id)).size).toBe(8);
    expect(upcomingDrafts(plan, Date.parse("2027-02-01"))).toEqual(drafts);
  });
  it("preserves fortnightly parity after a long absence", () => {
    const drafts = upcomingDrafts({ ...plan, frequency: "fortnightly" }, Date.parse("2026-11-10"));
    expect(drafts[0].localDate).toBe("2026-11-14");
    expect(drafts[1].localDate).toBe("2026-11-28");
  });
  it("pauses and resumes without changing the series identity", () => {
    expect(upcomingDrafts({ ...plan, paused: true }, now)).toEqual([]);
    expect(upcomingDrafts(plan, now)[0].id).toBe(`${plan.seriesId}:2026-10-03`);
  });
  it("keeps skips excluded and fills the eighth slot", () => {
    const drafts = upcomingDrafts({ ...plan, skippedDates: ["2026-10-10"] }, now);
    expect(drafts).toHaveLength(8); expect(drafts.some(d => d.localDate === "2026-10-10")).toBe(false);
    expect(drafts[7].localDate).toBe("2026-11-28");
  });
  it("uses Memphis local 10am across DST and independent meeting points", () => {
    const drafts = upcomingDrafts(plan, now);
    expect(new Date(drafts[4].start * 1000).getUTCHours()).toBe(15);
    expect(new Date(drafts[5].start * 1000).getUTCHours()).toBe(16);
    drafts[0].meetingPoint.description = "Changed";
    expect(drafts[1].meetingPoint.description).toBe("Square");
    expect(plan.meetingPoint.description).toBe("Square");
  });
  it("edits only one saved draft and keeps its original occurrence address",()=>{
    const original=upcomingDrafts(plan,now);
    const target=original[0];
    const edited={...plan,draftEdits:{[target.id]:{localDate:"2026-10-04",localTime:"11:30",meetingPoint:{description:"Library steps",latitude:35.2,longitude:-90.1}}}};
    const values=new Map<string,string>();
    const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
    saveRecurringPlan(storage,edited);
    const loaded=readRecurringPlan(storage,plan.owner,plan.cityId);
    expect(loaded).not.toBeNull();
    const drafts=upcomingDrafts(loaded!,now);
    expect(drafts[0].id).toBe(target.id);
    expect(drafts[0]).toMatchObject({localDate:"2026-10-04",localTime:"11:30",meetingPoint:{description:"Library steps",latitude:35.2,longitude:-90.1}});
    expect(drafts[0].start).toBeGreaterThan(target.start);
    expect(drafts.slice(1)).toEqual(original.slice(1));
  });
  it("rejects an edit that collides with another draft date",()=>{
    const target=upcomingDrafts(plan,now)[0];
    expect(()=>upcomingDrafts({...plan,draftEdits:{[target.id]:{localDate:"2026-10-10",localTime:"11:30",meetingPoint:plan.meetingPoint}}},now)).toThrow("share a date");
  });
  it("replenishes the review window when an edited date has passed",()=>{
    const target=upcomingDrafts(plan,now)[0];
    const moved={...plan,draftEdits:{[target.id]:{localDate:"2026-10-04",localTime:"11:30",meetingPoint:plan.meetingPoint}}};
    const later=upcomingDrafts(moved,Date.parse("2026-10-05T00:00:00Z"));
    expect(later).toHaveLength(8);
    expect(later.some(draft=>draft.id===target.id)).toBe(false);
    expect(later[0].localDate).toBe("2026-10-10");
  });
  it("persists a plan and isolates identities and cities", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    saveRecurringPlan(storage, plan);
    expect(readRecurringPlan(storage, plan.owner, plan.cityId)).toEqual(plan);
    expect(readRecurringPlan(storage, "b".repeat(64), plan.cityId)).toBeNull();
    expect(readRecurringPlan(storage, plan.owner, plan.seriesId)).toBeNull();
    expect([...values.values()][0]).not.toContain("nsec");
  });
  it("fails visibly for malformed/cross-account stored plans", () => {
    for (const raw of ["{", JSON.stringify({ ...plan, owner: "b".repeat(64) }), JSON.stringify({ ...plan, weekday: 10 }), JSON.stringify({ ...plan, firstDate: "2026-02-30" })]) {
      expect(() => readRecurringPlan({ getItem: () => raw, setItem: () => {} }, plan.owner, plan.cityId)).toThrow();
    }
  });
  it("does not claim persistence when browser storage is blocked", () => {
    const storage = { getItem: () => { throw new Error("Blocked"); }, setItem: () => { throw new Error("Quota exceeded"); } };
    expect(() => saveRecurringPlan(storage, plan)).toThrow("Quota exceeded");
    expect(() => readRecurringPlan(storage, plan.owner, plan.cityId)).toThrow("Blocked");
  });
  it("rejects DST-gap times instead of silently shifting a walk", () => {
    expect(() => upcomingDrafts({ ...plan, firstDate: "2027-03-14", weekday: 0, localTime: "02:30" }, Date.parse("2027-03-01"))).toThrow();
  });
});
