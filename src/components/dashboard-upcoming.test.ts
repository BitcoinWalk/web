import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import DashboardUpcoming from "./dashboard-upcoming";
import type {DashboardSummary} from "../nostr/dashboard-data";
const empty:DashboardSummary={cities:{value:0},walks:{value:0},hosting:{value:0},pending:{value:0},checkedAt:"",nextWalks:[],nextHosting:[],unscheduled:[],pendingReviews:[]};
describe("overview action cards",()=>{
 it("shows unavailable instead of a false scheduling action after failed reads",()=>{
  const html=renderToStaticMarkup(createElement(DashboardUpcoming,{role:"super-admin",summary:{...empty,nextWalks:null,unscheduled:null,pendingReviews:null}}));
  expect(html).toContain("Schedule checks unavailable");
  expect(html).not.toContain("add a walk");
  expect(html).toContain("Approval requests unavailable");
 });
 it("links a member's hosting preview to Walks without moderation controls",()=>{
  const html=renderToStaticMarkup(createElement(DashboardUpcoming,{role:"member",summary:empty}));
  expect(html).toContain("Next walks you’re hosting");
  expect(html).not.toContain("/admin/cities?tab=requests");
  expect(html).toContain("/admin/walks");
 });
 it("links pending revisions to their exact approval anchor",()=>{
  const id="a".repeat(64);
  const html=renderToStaticMarkup(createElement(DashboardUpcoming,{role:"super-admin",summary:{...empty,pending:{value:1},pendingReviews:[{event:{id},city:{cityName:"Memphis"}}] as never}}));
  expect(html).toContain("/admin/cities?tab=requests#submission-"+id);
 });
});
