import {createElement} from "react";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {DashboardContext,type DashboardSession} from "../../../components/dashboard-context";
import WalksPage from "./page";

const admin:DashboardSession={pubkey:"a".repeat(64),role:"super-admin",cityCount:1,cities:[{id:"city",name:"Test City"}],selectedCity:"city",grants:[],directory:null};
describe("Walks module",()=>{
 it("keeps walk visibility inline without duplicate tabs",()=>{const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:admin},createElement(WalksPage))),source=readFileSync(new URL("../../organizer/events/_screen.tsx",import.meta.url),"utf8");expect(source).toContain('hidden?"Unhide this walk":"Hide this walk"');expect(html).not.toContain("Schedule and manage walks");expect(html).not.toContain("Moderation and suspension");expect(html).not.toContain('role="tablist"');});
});
