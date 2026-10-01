import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import DashboardShell from "./dashboard-shell";

vi.mock("next/navigation",()=>({usePathname:()=>"/admin"}));

describe("dashboard entry",()=>{
  it("shows only the shared account module while disconnected",()=>{
    const html=renderToStaticMarkup(createElement(DashboardShell,null,createElement("p",null,"Dashboard content")));
    expect(html).toContain("Create new account");
    expect(html).toContain("Connect with browser extension");
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
});
