import {describe,expect,it} from "vitest";
import type {CityRevision} from "../nostr/city-records";
import {organizerCityInventory} from "./organizer-city-inventory";

const creator="a".repeat(64),pending={event:{id:"1".repeat(64),pubkey:creator,created_at:1},city:{cityId:"11111111-1111-4111-8111-111111111111",cityName:"Yerevan",slug:"yerevan",requestedTier:"free"}} as unknown as CityRevision;

describe("organizer city inventory",()=>{
 it("shows a creator-owned pending city without granting edit permission",()=>{
  expect(organizerCityInventory(creator,[],[pending],[])).toEqual([{revision:pending,editable:false,status:"awaiting-approval"}]);
 });
 it("does not expose another creator's pending city",()=>{
  expect(organizerCityInventory("b".repeat(64),[],[pending],[])).toEqual([]);
 });
});
