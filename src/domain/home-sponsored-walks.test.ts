import {describe,expect,it} from "vitest";
import {filterHomeSponsoredWalks,sponsoredWalkPreview,type HomeSponsoredWalk} from "./home-sponsored-walks";

const row=(cityId:string,eventId:string,start:number):HomeSponsoredWalk=>({cityId,cityName:cityId,eventId,href:`/${cityId}/${eventId}`,meetingPoint:"Town square",sponsorPubkey:"a".repeat(64),start,timeZone:"UTC"});

describe("sponsoredWalkPreview",()=>{
 it("keeps date order while showing at most one walk per city",()=>{
  const rows=[row("madeira","first",10),row("madeira","second",20),row("london","third",30),row("graz","fourth",40),row("warsaw","fifth",50)];
  expect(sponsoredWalkPreview(rows).map(item=>item.eventId)).toEqual(["first","third","fourth"]);
  expect(sponsoredWalkPreview(rows,4).map(item=>item.eventId)).toEqual(["first","third","fourth","fifth"]);
 });
 it("rejects invalid limits",()=>expect(sponsoredWalkPreview([row("madeira","first",10)],0)).toEqual([]));
 it("uses the homepage query for sponsored cities and meeting points",()=>{
  const rows=[{...row("madeira","first",10),cityName:"Madeira",meetingPoint:"Funchal marina"},{...row("warsaw","second",20),cityName:"Warszawa",meetingPoint:"Old Town"}];
  expect(filterHomeSponsoredWalks(rows,"funCHAL").map(item=>item.cityId)).toEqual(["madeira"]);
  expect(filterHomeSponsoredWalks(rows,"Warszawa").map(item=>item.cityId)).toEqual(["warsaw"]);
  expect(filterHomeSponsoredWalks(rows," ")).toEqual(rows);
 });
});
