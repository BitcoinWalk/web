import type {MetadataRoute} from "next";

export default function manifest():MetadataRoute.Manifest{return {
 name:"BitcoinWalk",
 short_name:"BitcoinWalk",
 description:"Find a weekly BitcoinWalk, meet your local crowd and stay connected between walks.",
 start_url:"/",
 scope:"/",
 display:"standalone",
 background_color:"#f7f3eb",
 theme_color:"#f7931a",
 categories:["social","lifestyle"],
 icons:[
  {src:"/pwa/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
  {src:"/pwa/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
  {src:"/pwa/icon-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"},
 ],
 shortcuts:[
  {name:"Find a walk",short_name:"Find a walk",url:"/#find-walk",icons:[{src:"/pwa/icon-192.png",sizes:"192x192"}]},
  {name:"Start a walk",short_name:"Start a walk",url:"/start",icons:[{src:"/pwa/icon-192.png",sizes:"192x192"}]},
  {name:"Open dashboard",short_name:"Dashboard",url:"/admin",icons:[{src:"/pwa/icon-192.png",sizes:"192x192"}]},
 ],
};}
