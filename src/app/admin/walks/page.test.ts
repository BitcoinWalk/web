import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {DashboardContext,type DashboardSession} from "../../../components/dashboard-context";
import WalksPage,{walkTabFromLocation} from "./page";

const admin:DashboardSession={pubkey:"a".repeat(64),role:"super-admin",cityCount:1,cities:[{id:"city",name:"Test City"}],selectedCity:"city",grants:[],directory:null};
describe("Walks module",()=>{
 it("contains scheduling and super-admin moderation",()=>{const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:admin},createElement(WalksPage)));expect(html).toContain("Schedule and manage walks");expect(html).toContain("Moderation and suspension");});
 it("does not open moderation for non-admin roles",()=>{expect(walkTabFromLocation("?tab=moderation",false)).toBe("schedule");expect(walkTabFromLocation("?tab=moderation",true)).toBe("moderation");});
});
