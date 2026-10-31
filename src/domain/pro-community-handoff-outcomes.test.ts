import {describe,expect,it} from "vitest";
import {summarizeProCommunityHandoffs} from "./pro-community-handoff-outcomes";

describe("Pro community handoff aggregates",()=>{
 it("counts receiving-side evidence without exposing city or account identifiers",()=>{const report=summarizeProCommunityHandoffs(["confirmed","action-required","unknown"],100);expect(report).toEqual({checked:3,confirmed:1,actionRequired:1,unknown:1,checkedAt:100});expect(JSON.stringify(report)).not.toMatch(/city|owner|pubkey|relay|group/i);});
 it("does not invent a handoff when there are no eligible cities",()=>expect(summarizeProCommunityHandoffs([],100)).toEqual({checked:0,confirmed:0,actionRequired:0,unknown:0,checkedAt:100}));
});
