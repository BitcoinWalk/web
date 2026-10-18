import {finalizeEvent,getPublicKey,type EventTemplate} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {dashboardNip29CityRooms,dashboardNip29Rooms,mergeNip29Messages,nip29ComposerKey,nip29JoinTemplate,nip29MessageTemplate,nip29ParticipantCount,nip29RoomName,uniqueNip29Rooms,updateNip29Composer,validNip29Destination} from "./nip29-chat";

const key=new Uint8Array(32).fill(4),pubkey=getPublicKey(key),group="bitcoinwalk-london";
const signed=(template:EventTemplate)=>finalizeEvent(template,key);

describe("NIP-29 dashboard chat",()=>{
 it("accepts only explicit WSS destinations and bounded group IDs",()=>{
  expect(validNip29Destination({relay:"wss://london.bitcoinwalk.org",groupId:group})).toEqual({relay:"wss://london.bitcoinwalk.org/",groupId:group});
  for(const relay of ["ws://localhost","https://london.bitcoinwalk.org","wss://user@relay.example","wss://relay.example","wss://london.bitcoinwalk.org/private","broken"])expect(validNip29Destination({relay,groupId:group})).toBeNull();
  expect(validNip29Destination({relay:"wss://relay.example",groupId:"../room"})).toBeNull();
 });
 it("keeps only valid exact-group messages in deterministic bounded history",()=>{
  const first=signed({kind:9,created_at:10,tags:[["h",group]],content:" hello "}),other=signed({kind:9,created_at:11,tags:[["h","other"]],content:"wrong"});
  const rows=mergeNip29Messages([], [other,first],group,20);
  expect(rows).toEqual([{id:first.id,pubkey,content:"hello",createdAt:10}]);
  expect(mergeNip29Messages(rows,[first],group,20)).toEqual(rows);
 });
 it("collapses cities that currently share one room instead of pretending the chat changed",()=>{
  const shared={relay:"wss://chat.bitcoinwalk.org",groupId:"shared"};
  expect(uniqueNip29Rooms([{id:"a",name:"Warszawa",slug:"warszawa",chat:{scope:"global",nip29:shared}},{id:"b",name:"Madeira",slug:"madeira",chat:{scope:"global",nip29:shared}},{id:"c",name:"London",slug:"london",chat:{scope:"city",nip29:{relay:"wss://london.bitcoinwalk.org",groupId:"chat"}}}])).toEqual([
   expect.objectContaining({label:"London",scope:"city",cityIds:["c"]}),
   expect.objectContaining({label:"BitcoinWalk Global",scope:"global",cityIds:["a","b"]}),
  ]);
 });
 it("builds a bounded configured Hosts room only from a valid reviewed destination",()=>{
  expect(configuredNip29Room("Hosts","hosts",{relay:"wss://chat.bitcoinwalk.org",groupId:"9e8d282f27d9c9cd"})).toMatchObject({label:"Hosts",scope:"hosts",destination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"9e8d282f27d9c9cd"}});
  expect(configuredNip29Room("Hosts","hosts",{relay:"wss://evil.example",groupId:"hosts"})).toBeNull();
 });
 it("adds the independently published Global conversation after the selected city room",()=>{
  const global={relay:"wss://chat.bitcoinwalk.org",groupId:"13bc3a423b4f2954"},city={relay:"wss://chat.bitcoinwalk.org",groupId:"bitcoinwalk-rye"};
  expect(uniqueNip29Rooms([{id:"rye",name:"Rye",slug:"rye",avatarUrl:"https://bitcoinwalk.org/rye.jpg",chat:{scope:"city",nip29:city,communities:{global,city}}}])).toEqual([
   expect.objectContaining({label:"Rye",scope:"city",cityIds:["rye"],avatarUrl:"https://bitcoinwalk.org/rye.jpg"}),
   expect.objectContaining({label:"BitcoinWalk Global",scope:"global",cityIds:["rye"],destination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"13bc3a423b4f2954"}}),
  ]);
 });
 it("keeps the selected city and global communities visible as separate dashboard conversations",()=>{
  const global={relay:"wss://chat.bitcoinwalk.org",groupId:"global"},rye={relay:"wss://rye.bitcoinwalk.org",groupId:"rye"};
  const rooms=dashboardNip29Rooms([
   {id:"rye",name:"Rye",slug:"rye",avatarUrl:"https://bitcoinwalk.org/rye.webp",chat:{scope:"city",nip29:rye,communities:{city:rye,global}}},
   {id:"other",name:"Other",slug:"other",chat:{scope:"global",nip29:global,communities:{city:null,global}}},
  ],["rye"],"rye");
  expect(rooms.city).toMatchObject({label:"Rye",scope:"city",avatarUrl:"https://bitcoinwalk.org/rye.webp",destination:{...rye,relay:`${rye.relay}/`}});
  expect(rooms.global).toMatchObject({label:"BitcoinWalk Global",scope:"global",destination:{...global,relay:`${global.relay}/`}});
  expect(rooms.organizers).toMatchObject({label:"BitcoinWalk Hosts",scope:"organizers",destination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"bitcoinwalk-organizers"}});
  expect(rooms.city?.key).not.toBe(rooms.global?.key);
  expect(dashboardNip29Rooms([],[],"",false).organizers).toBeNull();
  expect(dashboardNip29CityRooms([
   {id:"rye",name:"Rye",slug:"rye",chat:{scope:"city",nip29:rye,communities:{city:rye,global}}},
   {id:"hanover",name:"Hanover",slug:"hanover",chat:{scope:"city",nip29:{relay:"wss://hanover.bitcoinwalk.org",groupId:"hanover"},communities:{city:{relay:"wss://hanover.bitcoinwalk.org",groupId:"hanover"},global}}},
  ],["rye","hanover"]).map(row=>row.label)).toEqual(["Hanover","Rye"]);
  expect(dashboardNip29Rooms([],[],"").organizers).toBeNull();
 });
 it("uses signed metadata only and builds exact join and message requests",()=>{
  const metadata=signed({kind:39000,created_at:10,tags:[["d",group],["name","chat"]],content:""});
  expect(nip29RoomName([metadata],group,"London")).toBe("chat");
  expect(nip29JoinTemplate(group,12)).toEqual({kind:9021,created_at:12,tags:[["h",group]],content:""});
 expect(nip29MessageTemplate(group," Hi ",13)).toEqual({kind:9,created_at:13,tags:[["h",group]],content:"Hi"});
 });
 it("counts unique participants from the latest valid signed membership record",()=>{
  const first="11".repeat(32),second="22".repeat(32),old=signed({kind:39002,created_at:10,tags:[["d",group],["p",first]],content:""}),latest=signed({kind:39002,created_at:11,tags:[["d",group],["p",first],["p",first,"admin"],["p",second],["p","invalid"]],content:""});
  expect(nip29ParticipantCount([old,latest],group)).toBe(2);
  expect(nip29ParticipantCount([latest],"other")).toBeNull();
 });
 it("isolates composer text and attachments by account and exact room",()=>{
  const london=nip29ComposerKey("a".repeat(64),"london"),global=nip29ComposerKey("a".repeat(64),"global"),other=nip29ComposerKey("b".repeat(64),"london");
  let state=updateNip29Composer({},london,{draft:"London draft"});
  state=updateNip29Composer(state,global,{attachment:"https://bitcoinwalk.org/global.webp"});
  state=updateNip29Composer(state,other,{draft:"Other account"});
  expect(state[london]).toEqual({draft:"London draft",attachment:""});
  expect(state[global]).toEqual({draft:"",attachment:"https://bitcoinwalk.org/global.webp"});
  expect(state[other]).toEqual({draft:"Other account",attachment:""});
  expect(updateNip29Composer(state,london,{draft:""})[london]).toBeUndefined();
 });
 it("counts unique members only from the latest verified group roster",()=>{
  const first=signed({kind:39002,created_at:10,tags:[["d",group],["p",pubkey],["p",pubkey],["p","f".repeat(64)]],content:""});
  const latest=signed({kind:39002,created_at:11,tags:[["d",group],["p",pubkey]],content:""});
  expect(nip29ParticipantCount([first,latest],group)).toBe(1);
  expect(nip29ParticipantCount([],group)).toBeNull();
 });
});
