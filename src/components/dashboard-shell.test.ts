import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import DashboardShell,{DashboardBrand,DashboardDataHealth} from "./dashboard-shell";
import {combinedPendingRequestCount} from "./pending-request-count";
import ThemeProvider from "../design-system/theme-provider";

const navigation=vi.hoisted(()=>({path:"/admin"}));
vi.mock("next/navigation",()=>({usePathname:()=>navigation.path}));

describe("dashboard entry",()=>{
  it("shows site navigation and the shared account module while disconnected",()=>{
    navigation.path="/admin";
    const html=renderToStaticMarkup(createElement(ThemeProvider,null,createElement(DashboardShell,null,createElement("p",null,"Dashboard content"))));
    expect(html).toContain('aria-label="Site navigation"');
    expect(html).toContain(">Sign up</button>");
    expect(html).toContain("Sign in with browser extension");
    expect(html).toContain("Private key or signer");
    expect(html).toContain("Create a new Nostr identity, or connect one you already use.");
    expect(html).not.toContain("open your dashboard");
    expect(html).toContain("data-hide-site-footer");
    expect(html).not.toContain("Welcome to your dashboard!");
    expect(html).not.toContain('aria-label="Dashboard"');
    expect(html).not.toContain('data-status="disconnected"');
    expect(html).not.toContain("Connect signer");
    expect(html).not.toContain("Refresh / switch identity");
    expect(html).not.toContain("Public site");
    expect(html).not.toContain("All available cities");
    expect(html).not.toContain("<select");
  });
  it("keeps a canonical chat fallback contextual while the account connects",()=>{
    navigation.path="/admin/chat";
    const html=renderToStaticMarkup(createElement(ThemeProvider,null,createElement(DashboardShell,null,createElement("p",null,"Chat content"))));
    expect(html).toContain("Open Walkie Talkie");
    expect(html).toContain("continue to the requested conversation");
    expect(html).not.toContain("Chat content");
    navigation.path="/admin";
  });
});

describe("signed-in dashboard brand",()=>{
  it("uses the supplied white wordmark and exposes its icon crop as the collapsed mobile menu",()=>{
    const collapsed=renderToStaticMarkup(createElement(ThemeProvider,null,createElement(DashboardBrand,{open:false,onToggle:()=>{}})));
    expect(collapsed).toContain("bitcoinwalk-horizontal-white.png");
    expect(collapsed).toContain('aria-label="Open dashboard menu"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('data-open="false"');

    const expanded=renderToStaticMarkup(createElement(ThemeProvider,null,createElement(DashboardBrand,{open:true,onToggle:()=>{}})));
    expect(expanded).toContain('aria-label="Close dashboard menu"');
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain('data-open="true"');
  });
});

describe("dashboard request totals",()=>{
  it("does not present an unknown queue as zero",()=>{
    expect(combinedPendingRequestCount({cities:0,proActivations:null})).toBeNull();
    expect(combinedPendingRequestCount({cities:null,proActivations:0})).toBeNull();
    expect(combinedPendingRequestCount({cities:0,proActivations:0})).toBe(0);
    expect(combinedPendingRequestCount({cities:2,proActivations:3})).toBe(5);
  });
});

describe("chat dashboard status",()=>{
 it("removes the entire healthy banner wrapper only in chat",()=>{
  const props={health:{state:"ready" as const,message:"Current."},busy:false,onRetry:()=>{}};
  expect(renderToStaticMarkup(createElement(DashboardDataHealth,{...props,chat:true}))).toBe("");
  expect(renderToStaticMarkup(createElement(DashboardDataHealth,{...props,chat:false}))).toContain("Data up to date");
 });
 it.each(["loading","partial","stale","failed"] as const)("retains %s feedback and recovery in chat",state=>{
  const html=renderToStaticMarkup(createElement(DashboardDataHealth,{chat:true,health:{state,message:"Check required."},busy:false,onRetry:()=>{}}));
  expect(html).toContain("Check required.");if(state!=="loading")expect(html).toContain("Retry");if(state==="failed")expect(html).toContain('role="alert"');
 });
});
