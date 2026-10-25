import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync("src/components/location-picker.tsx","utf8");

describe("existing-city meeting-point finder",()=>{
 it("keeps the city locked while offering an independent address and landmark search",()=>{
  expect(source).toContain('readOnly={cityLocked}');
  expect(source).toContain('cityLocked&&<MeetingPointSearch');
  const chooser=source.slice(source.indexOf("function chooseMeetingPoint"),source.indexOf("const searchCity"));
  expect(chooser).toContain("setViewTarget");expect(chooser).toContain("onChange");expect(chooser).not.toContain("onCityNameChange");
 });
 it("requires an explicit accessible result selection before moving the pin",()=>{
  expect(source).toContain('role="combobox"');expect(source).toContain('role="listbox"');expect(source).toContain('role="option"');expect(source).toContain('aria-activedescendant');expect(source).toContain("if(visible.length)choose");
 });
});
