import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("city actions menu",()=>{
 it("lets the selected action receive its click before closing the menu",()=>{
  const source=readFileSync("src/components/city-actions-menu.tsx","utf8");
  expect(source).toContain('onClick={()=>setOpen(false)}');
  expect(source).not.toContain("onClickCapture");
 });
});
