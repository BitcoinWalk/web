import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import RequestsPage from "./page";

describe("request administration",()=>{
 it("has a dedicated request module",()=>{
  const html=renderToStaticMarkup(createElement(RequestsPage));
  expect(html).toContain("<h1>Requests</h1>");
  expect(html).toContain("<h2>Requests</h2>");
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Search pending city requests…");
 });
});
