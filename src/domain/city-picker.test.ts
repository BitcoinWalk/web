import {describe,expect,it} from "vitest";
import {showCityInPicker} from "./city-picker";

describe("city picker visibility",()=>{
  it("hides only the named permission-test cities",()=>{
    expect(showCityInPicker("Organizers permission test")).toBe(false);
    expect(showCityInPicker(" Protected Editor Isolation Test ")).toBe(false);
    expect(showCityInPicker("Memphis")).toBe(true);
    expect(showCityInPicker("Organizers permission test walk")).toBe(true);
  });
});
