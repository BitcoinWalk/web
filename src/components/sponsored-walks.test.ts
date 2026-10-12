import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import type {HomeSponsoredWalk} from "../domain/home-sponsored-walks";
import SponsoredWalks from "./sponsored-walks";

const row=(cityId:string,eventId:string,start:number,imageUrl?:string):HomeSponsoredWalk=>({cityId,cityName:cityId,eventId,href:`/${cityId}/${eventId}`,...(imageUrl?{imageUrl}:{}),meetingPoint:"Town square",sponsorPubkey:"a".repeat(64),start,timeZone:"UTC"});

describe("SponsoredWalks",()=>{
 it("renders nothing when the verified server feed is empty",()=>expect(renderToStaticMarkup(createElement(SponsoredWalks,{walks:[]}))).toBe(""));
 it("renders a quiet three-city preview with accessible links and a disclosure",()=>{
  const html=renderToStaticMarkup(createElement(SponsoredWalks,{walks:[row("Madeira","one",2_000_000_000,"/og.jpg"),row("Madeira","two",2_000_000_100),row("London","three",2_000_000_200),row("Graz","four",2_000_000_300),row("Warsaw","five",2_000_000_400)]}));
  expect(html).toContain("Upcoming sponsored walks");
  expect(html).toContain('href="/Madeira/one"');
  expect(html).not.toContain('href="/Madeira/two"');
  expect(html).toContain('href="/London/three"');
  expect(html).toContain('href="/Graz/four"');
  expect(html).not.toContain('href="/Warsaw/five"');
  expect(html).toContain('width="1200"');
  expect(html).toContain('height="630"');
  expect(html).toContain("See all sponsored walks");
  expect(html).toContain("Sponsored by a BitcoinWalk partner");
 });
});
