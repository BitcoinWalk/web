import { describe, expect, it } from "vitest";
import { cityAliases, cityDocumentSchema, cityHostname, cityPath, citySlugSchema, normalizedCityName } from "./city";

describe("city routes", () => {
  it("uses the canonical website hostname for a paid city", () => {
    expect(cityHostname()).toBe("bitcoinwalk.org");
  });

  it("keeps free cities on the shared hostname", () => {
    expect(cityHostname()).toBe("bitcoinwalk.org");
  });

  it("keeps both tiers under the city path",()=>{
    expect(cityPath({slug:"austin"})).toBe("/austin");
    expect(cityPath({slug:"radom"})).toBe("/radom");
  });

  it("rejects unsafe city slugs", () => {
    expect(citySlugSchema.safeParse("Austin Texas").success).toBe(false);
  });

  it("normalizes and deduplicates alternative city names",()=>{
    expect(cityAliases(" Warsaw\nWarschau, WARSAW; Warszawa ","Warszawa")).toEqual(["Warsaw","Warschau"]);
    expect(normalizedCityName("München")).toBe("munchen");
  });

  it("keeps aliases optional for existing city documents and bounds new lists",()=>{
    const base={cityId:"550e8400-e29b-41d4-a716-446655440000",slug:"warszawa",cityName:"Warszawa",startAt:"2026-10-03T10:00:00Z",description:"Walk",meetingPoint:{description:"Square",latitude:52.2,longitude:21}};
    expect(cityDocumentSchema.parse(base).aliases).toBeUndefined();
    expect(cityDocumentSchema.parse({...base,aliases:["Warsaw","Warschau"]}).aliases).toEqual(["Warsaw","Warschau"]);
    expect(cityDocumentSchema.safeParse({...base,aliases:Array.from({length:21},(_,i)=>`Alias ${i}`)}).success).toBe(false);
  });
});
