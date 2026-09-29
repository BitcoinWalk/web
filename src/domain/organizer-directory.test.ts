import {describe,expect,it} from "vitest";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import type {AuthorizationRecord,CityRevision} from "../nostr/city-records";
import {organizerDirectory} from "./organizer-directory";

const event=(id:string,created_at:number)=>({id:id.padEnd(64,"0"),pubkey:"f".repeat(64),created_at,kind:1,tags:[],content:"",sig:"0".repeat(128)}) as Event;
const creator="1".repeat(64),editor="2".repeat(64);
const grant=(cityId:string,editors:string[],created_at=1)=>({event:event(cityId,created_at),grant:{cityId,creatorPubkey:creator,creatorRevisionId:"a".repeat(64),superAdminPubkey:SUPER_ADMIN_PUBKEY,editorPubkeys:editors}}) as AuthorizationRecord;
const revision=(cityId:string,cityName:string,created_at=1)=>({event:event(cityId+created_at,created_at),city:{cityId,cityName}}) as CityRevision;

describe("organizer directory",()=>{
 it("groups created and editable cities without treating the super-admin as an organizer",()=>{
  const rows=organizerDirectory([grant("city-a",[creator,editor,SUPER_ADMIN_PUBKEY]),grant("city-b",[creator])],[revision("city-a","Austin"),revision("city-b","Berlin")]);
  expect(rows).toEqual([{pubkey:creator,createdCities:["Austin","Berlin"],editorCities:[]},{pubkey:editor,createdCities:[],editorCities:["Austin"]}]);
 });
 it("uses only the latest grant and respects the selected-city filter",()=>{
  const rows=organizerDirectory([grant("city-a",[creator,editor],1),grant("city-a",[creator],2)],[revision("city-a","Austin")],"city-a");
  expect(rows).toEqual([{pubkey:creator,createdCities:["Austin"],editorCities:[]}]);
 });
});
