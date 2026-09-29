import {describe,expect,it} from "vitest";
import {encodeGeohash} from "./geohash";

describe("geohash",()=>{
  it("encodes meeting points with deterministic standard base32 precision",()=>{
    expect(encodeGeohash(30.2672,-97.7431)).toBe("9v6kpvcxh");
    expect(encodeGeohash(35.14332878435158,-90.04102885724478)).toBe("9ypzzjdhe");
  });
  it("rejects invalid coordinates and precision",()=>{
    expect(()=>encodeGeohash(91,0)).toThrow("coordinates");
    expect(()=>encodeGeohash(0,181)).toThrow("coordinates");
    expect(()=>encodeGeohash(0,0,0)).toThrow("precision");
  });
});
