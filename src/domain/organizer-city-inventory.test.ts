import {describe,expect,it} from "vitest";
import type {CityRevision} from "../nostr/city-records";
import {organizerCityInventory} from "./organizer-city-inventory";
import {ARCHIVE_NOTE} from "../nostr/moderation";

const creator="a".repeat(64),pending={event:{id:"1".repeat(64),pubkey:creator,created_at:1},city:{cityId:"11111111-1111-4111-8111-111111111111",cityName:"Yerevan",slug:"yerevan",requestedTier:"free"}} as unknown as CityRevision;

describe("organizer city inventory",()=>{
 it("shows a creator-owned pending city without granting edit permission",()=>{
  expect(organizerCityInventory(creator,[],[pending],[])).toEqual([{revision:pending,editable:false,status:"awaiting-approval"}]);
 });
 it("does not expose another creator's pending city",()=>{
  expect(organizerCityInventory("b".repeat(64),[],[pending],[])).toEqual([]);
 });
 it("keeps an archived creator city in a read-only archived section",()=>{
  const decisions=[{event:{id:"2".repeat(64),created_at:2},approval:{cityId:pending.city.cityId,cityRevisionId:pending.event.id,status:"approved"}},{event:{id:"3".repeat(64),created_at:3},approval:{cityId:pending.city.cityId,cityRevisionId:pending.event.id,status:"revoked",note:ARCHIVE_NOTE}}] as never;
  expect(organizerCityInventory(creator,[],[pending],decisions)).toEqual([{revision:pending,editable:false,status:"archived"}]);
 });
});
