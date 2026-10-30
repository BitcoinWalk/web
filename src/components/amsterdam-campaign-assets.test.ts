import {readFileSync,statSync} from "node:fs";
import {join} from "node:path";
import {describe,expect,it} from "vitest";

describe("Amsterdam campaign assets",()=>{
 it("uses the packaged campaign hero for Amsterdam walk pages",()=>{
  const page=readFileSync(join(process.cwd(),"src/components/walk-event.tsx"),"utf8");
  expect(page).toContain('city.slug==="amsterdam"?["/brand/campaigns/amsterdam-walk-hero.webp"]');
  expect(statSync(join(process.cwd(),"public/brand/campaigns/amsterdam-walk-hero.webp")).size).toBeLessThan(1024*1024);
 });
 it("ships optimized homepage and social artwork",()=>{
  expect(statSync(join(process.cwd(),"public/brand/campaigns/amsterdam-homepage-walk.webp")).size).toBeLessThan(1024*1024);
  expect(statSync(join(process.cwd(),"public/brand/campaigns/amsterdam-conference-og-signal.jpg")).size).toBeLessThan(1024*1024);
 });
});
