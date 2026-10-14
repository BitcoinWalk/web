import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import DashboardAccountMenu from "./dashboard-account-menu";

vi.mock("../nostr/profiles",()=>({watchPublicProfiles:()=>()=>{}}));

describe("dashboard account menu",()=>{
 it("keeps account actions behind the avatar on every section",()=>{const html=renderToStaticMarkup(createElement(DashboardAccountMenu,{pubkey:"1".repeat(64),role:"organizer",walkCount:5,onDisconnect:()=>{}}));expect(html).toContain("Account menu");expect(html).toContain("Profile");expect(html).toContain("Wallet");expect(html).toContain("Badge");expect(html).toContain("Host");expect(html).toContain("Walk count");expect(html).toContain("Disconnect");});
});
