import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OgImageComposer from "./og-image-composer";

describe("OG image composer text placement",()=>{
 it("locks text beneath the mark without separate positioning controls",()=>{
  const html=renderToStaticMarkup(createElement(OgImageComposer));
  expect(html.match(/aria-label="Horizontal position alignment"/g)).toHaveLength(1);
  expect(html.match(/aria-label="Vertical position alignment"/g)).toHaveLength(1);
  expect(html).toContain("Powered by");
  expect(html).toContain("BitcoinWalk symbol, White.");
  expect(html).toContain("1 / 3");
  expect(html).toContain("Choose city photo");
 });
});
