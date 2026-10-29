import {describe,expect,it} from "vitest";
import manifest from "./manifest";

describe("BitcoinWalk web app manifest",()=>{it("is installable with normal and maskable icons plus useful shortcuts",()=>{
 const value=manifest();
 expect(value).toMatchObject({name:"BitcoinWalk",short_name:"BitcoinWalk",start_url:"/",scope:"/",display:"standalone",theme_color:"#f7931a"});
 expect(value.icons).toEqual(expect.arrayContaining([
  expect.objectContaining({src:"/pwa/icon-192.png",sizes:"192x192",purpose:"any"}),
  expect.objectContaining({src:"/pwa/icon-512.png",sizes:"512x512",purpose:"any"}),
  expect.objectContaining({src:"/pwa/icon-maskable-512.png",sizes:"512x512",purpose:"maskable"}),
 ]));
 expect(value.shortcuts?.map(item=>item.url)).toEqual(["/#find-walk","/start","/admin"]);
});});
