import { describe, expect, it } from "vitest";
import { canEditCity, editableCityRevisions, editedCity, localDateTime } from "./organizer-edit";
import { SUPER_ADMIN_PUBKEY } from "./authority";
import type { ApprovalRecord, AuthorizationRecord, CityRevision } from "./city-records";
import { ARCHIVE_NOTE } from "./moderation";
import type { CityDocument } from "../domain/city";

const creator="a".repeat(64),editor="b".repeat(64),outsider="c".repeat(64);
const city: CityDocument={cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f",slug:"radom",cityName:"Radom",startAt:"2026-10-03T10:00:00Z",description:"Original",meetingPoint:{description:"Square",latitude:1,longitude:2},heroImageUrl:"https://example.com/image.jpg",chatUrl:"https://example.com/chat",sponsor:{name:"Sponsor",logoUrl:"https://example.com/logo.png"}};
const grant={cityId:city.cityId,creatorPubkey:creator,creatorRevisionId:"d".repeat(64),editorPubkeys:[creator,editor],superAdminPubkey:SUPER_ADMIN_PUBKEY};
const record=(time:number,editors=grant.editorPubkeys):AuthorizationRecord=>({event:{created_at:time,id:String(time)} as AuthorizationRecord["event"],grant:{...grant,editorPubkeys:editors}});
const rev=(author:string,time:number):CityRevision=>({event:{pubkey:author,created_at:time,id:String(time)} as CityRevision["event"],city});

describe("organizer editor",()=>{
 it.each(["6302b5c2-b579-4441-a828-9bffce073f97","05b52cd1-9e17-4d1a-80e9-1d3d7114db01"])("hides archived city %s for editors and super-admin until restored",cityId=>{
  const revision={...rev(creator,10),city:{...city,cityId}};
  const authorization={...record(1),grant:{...grant,cityId}};
  // Referenced approved snapshot need not be the latest editable revision.
  const archive:ApprovalRecord={event:{created_at:20,id:"archive"} as ApprovalRecord["event"],approval:{cityId,cityRevisionId:"d".repeat(64),status:"revoked",note:ARCHIVE_NOTE}};
  const rejection:ApprovalRecord={event:{created_at:30,id:"reject"} as ApprovalRecord["event"],approval:{cityId,cityRevisionId:"e".repeat(64),status:"rejected"}};
  for(const user of [creator,editor,SUPER_ADMIN_PUBKEY])expect(editableCityRevisions(user,[authorization],[revision],[archive,rejection])).toEqual([]);
  const restore:ApprovalRecord={event:{created_at:40,id:"restore"} as ApprovalRecord["event"],approval:{cityId,cityRevisionId:revision.event.id,status:"approved"}};
  expect(editableCityRevisions(creator,[authorization],[revision],[restore,archive,rejection])).toEqual([revision]);
  expect(editableCityRevisions(creator,[authorization],[revision],[{...archive,approval:{...archive.approval,note:"Disapproved, not archived"}}])).toEqual([revision]);
 });
 it("allows creator, listed editor and super-admin, but not an outsider",()=>{
  for(const key of [creator,editor,SUPER_ADMIN_PUBKEY]) expect(canEditCity(key,grant)).toBe(true);
  expect(canEditCity(outsider,grant)).toBe(false);
 });
 it("uses the newest grant so a removed editor cannot load the form",()=>{
  expect(editableCityRevisions(editor,[record(1),record(2,[creator])],[rev(creator,1)])).toEqual([]);
 });
 it("lists only registered cities and ignores unauthorized candidate revisions",()=>{
  const valid=rev(creator,1);
  expect(editableCityRevisions(creator,[],[valid])).toEqual([]);
  expect(editableCityRevisions(creator,[record(1)],[rev(outsider,3),valid])).toEqual([valid]);
 });
 it("selects the newest editable revision without changing source array order",()=>{
  const old=rev(creator,1),latest=rev(editor,2),input=[old,latest];
  expect(editableCityRevisions(SUPER_ADMIN_PUBKEY,[record(1)],input)).toEqual([latest]);
  expect(input).toEqual([old,latest]);
 });
 it("does not grant access to a different city",()=>{
  const other={...rev(creator,1),city:{...city,cityId:"77f137cb-2ac1-4eef-8358-7dd66b45922f"}};
  expect(editableCityRevisions(creator,[record(1)],[other])).toEqual([]);
 });
 it("retains identity, chat and sponsor while applying allowed edits",()=>{
  const result=editedCity(city,{...city,description:"Changed",cityId:crypto.randomUUID(),slug:"hijack",chatUrl:"https://other.example"} as Parameters<typeof editedCity>[1]);
  expect(result).toEqual({...city,description:"Changed"});
  expect(city.description).toBe("Original");
 });
 it("validates meeting point and date",()=>{
  expect(()=>editedCity(city,{...city,meetingPoint:{...city.meetingPoint,latitude:100}})).toThrow();
  expect(()=>editedCity(city,{...city,startAt:"invalid"})).toThrow();
 });
 it("round trips local datetime without shifting the meeting time",()=>{
  const iso="2026-10-03T10:23:00.000Z";
  expect(new Date(localDateTime(iso)).toISOString()).toBe(iso);
 });
});
