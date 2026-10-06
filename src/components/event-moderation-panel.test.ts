import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {DashboardContext,type DashboardSession} from "./dashboard-context";
import EventModerationPanel from "./event-moderation";

const admin:DashboardSession={pubkey:"a".repeat(64),role:"super-admin",cityCount:1,cities:[{id:"city",name:"Test City"}],selectedCity:"",grants:[],directory:null};

describe("event moderation city selection",()=>{
 it("uses the reusable searchable city finder",()=>{
  const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:admin},createElement(EventModerationPanel,{scope:"walk"})));
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Search cities to moderate…");
  expect(html).not.toContain("<select");
 });
 it("embeds city publishing suspension without a second city selector",()=>{
  const html=renderToStaticMarkup(createElement(DashboardContext.Provider,{value:admin},createElement(EventModerationPanel,{scope:"city",fixedCityId:"city",cityName:"Test City"})));
  expect(html).toContain("Publishing access");
  expect(html).toContain("Suspend city");
  expect(html).toContain("Unpublish city");
  expect(html).not.toContain('role="combobox"');
 });
});
