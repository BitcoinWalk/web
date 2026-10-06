import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import EditorsScreen from "./_screen";

describe("city editor selection",()=>{
 it("uses the reusable searchable city finder",()=>{
  const html=renderToStaticMarkup(createElement(EditorsScreen));
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Search cities to manage editors…");
  expect(html).not.toContain("<select");
 });
});
