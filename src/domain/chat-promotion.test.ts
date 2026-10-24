import {describe,expect,it} from "vitest";
import type {Nip29CityRoom,Nip29Room} from "../nostr/nip29-chat";
import {canonicalChatPromotionPath} from "./chat-promotion";

const destination={relay:"wss://chat.bitcoinwalk.org/",groupId:"room"};
const cities:Nip29CityRoom[]=[{id:"city-madeira",name:"BitcoinWalk Madeira",slug:"madeira",chat:{scope:"city",nip29:destination}}];
function room(scope:Nip29Room["scope"],cityIds:string[]=[]):Nip29Room{return {key:scope,label:scope,scope,cityIds,destination};}

describe("chat app promotion links",()=>{
 it("preserves each exact canonical conversation",()=>{
  expect(canonicalChatPromotionPath({guideSelected:true,room:null,cities})).toBe("/chat/guide");
  expect(canonicalChatPromotionPath({guideSelected:false,room:room("global"),cities})).toBe("/chat/global");
  expect(canonicalChatPromotionPath({guideSelected:false,room:room("organizers"),cities})).toBe("/chat/hosts");
  expect(canonicalChatPromotionPath({guideSelected:false,room:room("city",["city-madeira"]),cities})).toBe("/chat/madeira");
 });
 it("does not substitute another room when city context is missing",()=>{
  expect(canonicalChatPromotionPath({guideSelected:false,room:room("city",["missing"]),cities})).toBeNull();
  expect(canonicalChatPromotionPath({guideSelected:false,room:null,cities})).toBeNull();
 });
});
