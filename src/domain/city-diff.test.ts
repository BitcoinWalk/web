import {describe,expect,it} from "vitest";
import type {CityDocument} from "./city";
import {cityFieldChanges} from "./city-diff";
const city:CityDocument={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"warszawa",cityName:"Warszawa",startAt:"2026-10-03T10:00:00Z",description:"Walk",meetingPoint:{description:"Square",latitude:52.2,longitude:21},heroImageUrl:"https://example.com/old.jpg"};
describe("city revision diff",()=>{
 it("shows only changed fields for an edit",()=>{
  const changes=cityFieldChanges(city,{...city,aliases:["Warsaw","Warschau"],description:"Updated",heroImageUrl:"https://example.com/new.jpg"});
  expect(changes.map(change=>change.key)).toEqual(["aliases","description","heroImageUrl"]);
  expect(changes[0]).toMatchObject({before:"Not set",after:"Warsaw, Warschau"});
  expect(changes[2].image).toBe(true);
 });
 it("shows the complete document for a new city",()=>{
  expect(cityFieldChanges(null,city).map(change=>change.key)).toContain("latitude");
  expect(cityFieldChanges(null,city).map(change=>change.key)).toContain("sponsorOffer");
 });
});
