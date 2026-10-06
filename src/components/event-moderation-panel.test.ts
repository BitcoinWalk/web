import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {DashboardContext,type DashboardSession} from "./dashboard-context";
import EventModerationPanel from "./event-moderation";

const admin:DashboardSession={pubkey:"a".repeat(64),role:"super-admin",cityCount:1,cities:[{id:"city",name:"Test City"}],selectedCity:"",grants:[],directory:null};

describe("event moderation city selection",()=>{
 it("uses the reusable searchable city finder",()=>{
  const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:admin},createElement(EventModerationPanel)));
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Search cities to moderate…");
  expect(html).not.toContain("<select");
 });
});
