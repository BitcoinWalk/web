import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import BrandPage from "./page";

describe("brand asset catalogue",()=>{
 it("includes the four localised sat-walk lockups alongside the city-neutral system",()=>{
  const html=renderToStaticMarkup(createElement(BrandPage));
  expect(html).toContain("Sat-walk city lockups");
  expect(html).toContain("These are the sat-walk symbols used in localised logos");
  for(const asset of [
   "warszawa-satsman-on-white.png",
   "warszawa-satsman-on-black.png",
   "warszawa-satsman-vertical-on-white.png",
   "warszawa-satsman-vertical-on-black.png",
  ])expect(html).toContain(asset);
  expect(html).toContain("Need a logo for another city?");
 });
});
