import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import DashboardAccountMenu from "./dashboard-account-menu";

vi.mock("../nostr/profiles",()=>({watchPublicProfiles:()=>()=>{}}));

describe("dashboard account menu",()=>{
 it("keeps focused account actions behind the avatar on every section",()=>{const html=renderToStaticMarkup(createElement(DashboardAccountMenu,{pubkey:"1".repeat(64),role:"organizer",onDisconnect:()=>{}}));expect(html).toContain("Account menu");expect(html).toContain('href="/admin/profile"');expect(html).toContain("Notifications");expect(html).toContain("Wallet");expect(html).toContain("Badge");expect(html).toContain("Host");expect(html).toContain("Disconnect");expect(html).not.toContain("Public Nostr profile");expect(html).not.toContain("Walk count");});
});
