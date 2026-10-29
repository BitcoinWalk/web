const VERSION="bitcoinwalk-pwa-v1";
const OFFLINE=["/offline","/pwa/icon-192.png","/pwa/icon-512.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(OFFLINE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("bitcoinwalk-pwa-")&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET"||request.mode!=="navigate")return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 event.respondWith(fetch(request).catch(()=>caches.match("/offline").then(response=>response||Response.error())));
});
self.addEventListener("push",event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const title=typeof data.title==="string"&&data.title.trim()?data.title.slice(0,80):"BitcoinWalk update";
 const body=typeof data.body==="string"&&data.body.trim()?data.body.slice(0,180):"Open BitcoinWalk for the latest details.";
 const candidate=typeof data.path==="string"?data.path:"/admin";
 let path="/admin";try{const target=new URL(candidate,self.location.origin);if(candidate.startsWith("/")&&!candidate.startsWith("//")&&target.origin===self.location.origin)path=target.pathname+target.search+target.hash;}catch{}
 event.waitUntil(self.registration.showNotification(title,{body,icon:"/pwa/icon-192.png",badge:"/pwa/icon-192.png",data:{path},tag:typeof data.tag==="string"?data.tag.slice(0,120):undefined,renotify:false}));
});
self.addEventListener("notificationclick",event=>{event.notification.close();const path=event.notification.data?.path||"/admin";event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{for(const client of clients){if(new URL(client.url).origin===self.location.origin){client.navigate(path);return client.focus();}}return self.clients.openWindow(path);}));});
