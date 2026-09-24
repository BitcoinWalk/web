import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import DashboardShell from "./dashboard-shell";

vi.mock("next/navigation",()=>({usePathname:()=>"/admin"}));

describe("dashboard header",()=>{
  it("shows the welcome, disconnected status and connect action without removed links",()=>{
    const html=renderToStaticMarkup(createElement(DashboardShell,null,createElement("p",null,"Dashboard content")));
    expect(html).toContain("Welcome to your dashboard!");
    expect(html).toContain("Connect signer");
    expect(html).toContain('data-status="disconnected"');
    expect(html).not.toContain("Refresh / switch identity");
    expect(html).not.toContain("Public site");
    expect(html).not.toContain("All available cities");
  });
});
