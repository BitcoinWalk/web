import {describe,expect,it} from "vitest";
import {dashboardChatHref,dashboardChatProblem,parseDashboardChatIntent} from "./chat-entry";

describe("resumable browser chat intent",()=>{
 it.each([
  ["?city=madeira",{kind:"city",city:"madeira"}],
  ["?room=guide",{kind:"guide"}],
  ["?room=global",{kind:"global"}],
  ["?room=hosts",{kind:"hosts"}],
 ] as const)("parses %s",(search,intent)=>expect(parseDashboardChatIntent(search)).toEqual(intent));
 it("ignores claims that cannot grant chat authority",()=>{
  expect(parseDashboardChatIntent("?city=madeira&role=super-admin&join=1&relay=wss%3A%2F%2Fevil.example")).toEqual({kind:"city",city:"madeira"});
 });
 it.each(["?room=hosts&city=madeira","?room=hosts&room=global","?city=madeira&city=london","?room=other","?city=../hosts","?city=Madeira","?city="])("refuses ambiguous or malformed intent %s",search=>expect(parseDashboardChatIntent(search)).toEqual({kind:"invalid"}));
 it("treats an ordinary dashboard visit as having no requested room",()=>expect(parseDashboardChatIntent("?tab=profile")).toBeNull());
 it("formats only the exact dashboard destination",()=>{
  expect(dashboardChatHref({kind:"city",city:"madeira"})).toBe("/admin/chat?city=madeira");
  expect(dashboardChatHref({kind:"hosts"})).toBe("/admin/chat?room=hosts");
  expect(dashboardChatHref(null)).toBe("/admin/chat");
 });
 it("never substitutes another room for an unavailable or unauthorized exact target",()=>{
  const all={cityFound:true,cityRoom:true,guide:true,global:true,hosts:true};
  expect(dashboardChatProblem({kind:"hosts"},{...all,hosts:false})).toContain("only to current verified city hosts");
  expect(dashboardChatProblem({kind:"city",city:"missing"},{...all,cityFound:false})).toBe("This city chat could not be found.");
  expect(dashboardChatProblem({kind:"city",city:"madeira"},{...all,cityRoom:false})).toBe("This city chat is not available yet.");
  expect(dashboardChatProblem({kind:"global"},{...all,global:false})).toBe("The Global chat is not available right now.");
  expect(dashboardChatProblem({kind:"guide"},all)).toBe("");
 });
});
