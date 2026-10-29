import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OgImageComposer from "./og-image-composer";

describe("OG image composer text placement",()=>{
 it("offers independent horizontal and vertical text position controls",()=>{
  const html=renderToStaticMarkup(createElement(OgImageComposer));
  expect(html).toContain('aria-label="Horizontal position alignment"');
  expect(html).toContain('aria-label="Vertical position alignment"');
  expect(html).toContain(">Top<");
  expect(html).toContain(">Centre<");
  expect(html).toContain(">Bottom<");
 });
});
