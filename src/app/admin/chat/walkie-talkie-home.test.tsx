import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
vi.mock("next/font/local",()=>({default:()=>({className:"ubuntu-logo"})}));
import WalkieTalkieHome from "./walkie-talkie-home";
import type {Nip29CityRoom,Nip29Room} from "../../../nostr/nip29-chat";

const destination={relay:"wss://chat.bitcoinwalk.org/",groupId:"city"};
const cities:Nip29CityRoom[]=[
 {id:"z",name:"Zürich",slug:"zurich",heroImageUrl:"https://images.example/zurich.webp",chat:{scope:"city",nip29:destination}},
 {id:"a",name:"Augsburg",slug:"augsburg",heroImageUrl:"https://images.example/augsburg.webp",chat:{scope:"city",nip29:destination}},
];
const rooms:Nip29Room[]=cities.map(city=>({key:city.id,label:city.name,scope:"city",cityIds:[city.id],destination}));

describe("Walkie Talkie home",()=>{it("shows every city alphabetically as a searchable photographic uppercase lockup",()=>{const html=renderToStaticMarkup(createElement(WalkieTalkieHome,{cities,rooms,guideAvailable:true,globalRoom:null,hostsRoom:null,status:"",onCity:()=>{},onGuide:()=>{},onGlobal:()=>{},onHosts:()=>{},onRetry:()=>{}}));expect(html.indexOf("AUGSBURG")).toBeLessThan(html.indexOf("ZÜRICH"));expect(html).toContain("https://images.example/augsburg.webp");expect(html).toContain("bitcoinwalk-horizontal-white.png");expect(html).toContain('placeholder="Search all cities…"');expect(html).toContain('aria-label="Open BitcoinWalk Augsburg"');expect(html).toContain(">2<");});});
