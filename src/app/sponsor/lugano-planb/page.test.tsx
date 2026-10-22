import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import LuganoEventSponsorship from "./page";

describe("Lugano event sponsorship page",()=>{
 it("keeps the offer concise, exclusive and free of the former partner reference",()=>{
  const html=renderToStaticMarkup(createElement(LuganoEventSponsorship));
  expect(html).toContain("Sponsor the Sunday BitcoinWalk.");
  expect(html).toContain("Exclusive event sponsorship");
  expect(html).toContain("Your logo goes on the event page, share images and promotional artwork.");
  expect(html).toContain("Create Lightning invoice · 210,000 sats");
  expect(html.match(/Create Lightning invoice/g)).toHaveLength(1);
  expect(html).not.toContain("Simply Bitcoin");
  expect(html).not.toContain("Your logo, everywhere this walk is advertised.");
 });
});
