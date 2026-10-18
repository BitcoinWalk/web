import {describe,expect,it,vi} from "vitest";
vi.mock("next/font/local",()=>({default:()=>({className:"ubuntu-logo"})}));
import {compactHomepageBrand} from "./city-directory";
import {cityLockupSize} from "../domain/city-lockup";
import {readFileSync} from "node:fs";
import {join} from "node:path";

describe("homepage brand",()=>{
 it("keeps the wordmark initially and compacts after the header scroll threshold",()=>{
  expect(compactHomepageBrand(0)).toBe(false);
  expect(compactHomepageBrand(72)).toBe(false);
  expect(compactHomepageBrand(73)).toBe(true);
 });
 it("scales the complete city lockup for longer uppercase names",()=>{
  expect(cityLockupSize("Rye")).toBe("short");
  expect(cityLockupSize("Augsburg")).toBe("medium");
  expect(cityLockupSize("Manchester")).toBe("medium");
  expect(cityLockupSize("Sankt Pölten City")).toBe("long");
 });
 it("adds the Plan B Forum campaign mark to the Lugano city card",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/city-directory.tsx"),"utf8");
  expect(page).toContain("isLuganoPlanBConference(city.slug,[city.heroImageUrl])");
  expect(page).toContain('luganoPlanB?"/brand/campaigns/lugano-planb-background.webp"');
  expect(page).toContain('/brand/campaigns/lugano-planb-forum-2026.png');
  expect(page).toContain('data-campaign={luganoPlanB?"lugano-planb":undefined}');
 });
});
