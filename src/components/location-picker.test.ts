import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync("src/components/location-picker.tsx","utf8");

describe("existing-city meeting-point finder",()=>{
 it("shows one Location field while keeping the signed city out of the editable control",()=>{
  expect(source).toContain('cityLocked?<MeetingPointSearch');
  expect(source).toContain('<label>Location');
  expect(source).not.toContain('Find an address or landmark');
  expect(source).not.toContain('readOnly={cityLocked}');
  const chooser=source.slice(source.indexOf("function chooseMeetingPoint"),source.indexOf("const searchCity"));
  expect(chooser).toContain("setViewTarget");expect(chooser).toContain("onChange");expect(chooser).not.toContain("onCityNameChange");
 });
 it("requires an explicit accessible result selection before moving the pin",()=>{
  expect(source).toContain('role="combobox"');expect(source).toContain('role="listbox"');expect(source).toContain('role="option"');expect(source).toContain('aria-activedescendant');expect(source).toContain("if(visible.length)choose");
 });
});
