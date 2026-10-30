import {describe,expect,it} from "vitest";
import {compactHomepageBrand,homepageCtaLabel} from "./city-directory";
import {readFileSync} from "node:fs";
import {join} from "node:path";

describe("homepage brand",()=>{
 it("keeps the wordmark initially and compacts after the header scroll threshold",()=>{
  expect(compactHomepageBrand(0)).toBe(false);
  expect(compactHomepageBrand(72)).toBe(false);
  expect(compactHomepageBrand(73)).toBe(true);
 });
 it("renames legacy homepage CTAs to the current Find a walk copy",()=>{
  expect(homepageCtaLabel("Find your city ↓")).toBe("Find a walk");
  expect(homepageCtaLabel("Find your walk ↓")).toBe("Find a walk");
  expect(homepageCtaLabel("Explore walks")).toBe("Explore walks");
 });
 it("offers the Walkie Talkie QR download card over the hero artwork",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/city-directory.tsx"),"utf8");
  const styles=readFileSync(join(process.cwd(),"src/components/city-directory.module.css"),"utf8");
  const card=readFileSync(join(process.cwd(),"src/components/app-download-card.tsx"),"utf8");
  expect(page).toContain("<AppDownloadCard/>");
  expect(card).toContain("Get your BitcoinWalk companion app");
  expect(card).toContain("Download on Zapstore");
  expect(page).not.toContain("Approved cities from BitcoinWalk’s public relay.");
  expect(page).not.toContain("App Store coming soon");
  expect(page).not.toContain("Google Play coming soon");
  expect(styles).toContain("/brand/satsman-ink.png");
  expect(card).toContain("https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie");
  expect(card).toContain("<QRCodeSVG value={destination}");
  expect(styles).toContain(".walkieDownload {box-sizing:border-box;width:min(100%,25rem)");
 });
 it("adds the Plan B Forum campaign mark to the Lugano city card",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/city-directory.tsx"),"utf8");
  expect(page).toContain("isLuganoPlanBConference(city.slug,[city.heroImageUrl])");
  expect(page).toContain('luganoPlanB?"/brand/campaigns/lugano-planb-background.webp"');
  expect(page).toContain('/brand/campaigns/lugano-planb-forum-2026.png');
  expect(page).toContain('luganoPlanB?"lugano-planb":undefined');
  expect(page).toContain('data-campaign={campaign}');
 });
 it("presents Amsterdam as an official Bitcoin Amsterdam side event",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/city-directory.tsx"),"utf8");
  const styles=readFileSync(join(process.cwd(),"src/components/city-directory.module.css"),"utf8");
  expect(page).toContain("isAmsterdamConference(city.slug)");
  expect(page).toContain('/brand/campaigns/bitcoin-amsterdam-white.png');
  expect(page).toContain('amsterdamConference?"Official side event"');
  expect(page).toContain('data-campaign={campaign}');
  expect(styles).toContain('.card[data-campaign="amsterdam-conference"]');
  expect(styles).toContain(".campaignLogoWide");
 });
});
