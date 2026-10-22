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
 it("renames only the legacy homepage CTA to Find your walk",()=>{
  expect(homepageCtaLabel("Find your city ↓")).toBe("Find your walk ↓");
  expect(homepageCtaLabel("Explore walks")).toBe("Explore walks");
 });
 it("offers the quiet Walkie Talkie prompt beneath the hero CTA",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/city-directory.tsx"),"utf8");
  expect(page).toContain("Prefer the app?");
  expect(page).toContain("Try Walkie Talkie");
  expect(page).toContain("/brand/walkie-talkie-zapstore-icon.png");
  expect(page).toContain("https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie");
 });
 it("adds the Plan B Forum campaign mark to the Lugano city card",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/city-directory.tsx"),"utf8");
  expect(page).toContain("isLuganoPlanBConference(city.slug,[city.heroImageUrl])");
  expect(page).toContain('luganoPlanB?"/brand/campaigns/lugano-planb-background.webp"');
  expect(page).toContain('/brand/campaigns/lugano-planb-forum-2026.png');
  expect(page).toContain('data-campaign={luganoPlanB?"lugano-planb":undefined}');
 });
});
