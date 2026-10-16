import {finalizeEvent,getPublicKey,type EventTemplate} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {mergeNip29Messages,nip29ComposerKey,nip29JoinTemplate,nip29MessageTemplate,nip29RoomName,uniqueNip29Rooms,updateNip29Composer,validNip29Destination} from "./nip29-chat";

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
   expect.objectContaining({label:"BitcoinWalk Global",scope:"global",cityIds:["a","b"]}),
   expect.objectContaining({label:"London",scope:"city",cityIds:["c"]}),
  ]);
 });
 it("uses signed metadata only and builds exact join and message requests",()=>{
  const metadata=signed({kind:39000,created_at:10,tags:[["d",group],["name","chat"]],content:""});
  expect(nip29RoomName([metadata],group,"London")).toBe("chat");
  expect(nip29JoinTemplate(group,12)).toEqual({kind:9021,created_at:12,tags:[["h",group]],content:""});
  expect(nip29MessageTemplate(group," Hi ",13)).toEqual({kind:9,created_at:13,tags:[["h",group]],content:"Hi"});
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
});
