import {parseChatPath,chatTargetPath,isReservedChatSlug,type ChatTarget} from "../domain/chat-target";
import {resolveCityRoute} from "../domain/city-route";
import {resolveCityChat,type ChatConfig,type ChatDestination} from "../domain/chat";
import type {CalendarSource} from "../nostr/calendar-records";
import {validNip29Destination} from "../nostr/nip29-chat";
import {loadSharedCities} from "./share-preview";
import {serverChatConfig} from "./chat-config";

export type ChatTargetResolution = {
  version:1;state:"resolved";target:ChatTarget;canonicalPath:string;webPath:string;
  access:"public-membership"|"account-inbox"|"signed-host-roster";
  transport:{protocol:"nip29";destination:ChatDestination}|{protocol:"nip17";pubkey:string}|null;
}|{version:1;state:"invalid"|"not-found"|"unavailable"};

type Registry={cities:CalendarSource[];config:ChatConfig;guidePubkey?:string};

/** Resolve only currently approved records. Resolved means an address, not
 * authorization, relay membership, a successful inbox read or a join action. */
export function resolveChatTarget(path:string,registry:Registry):ChatTargetResolution {
  const intent=parseChatPath(path);
  if(!intent)return {version:1,state:"invalid"};
  if(intent.kind==="hosts")return {version:1,state:"resolved",target:{version:1,kind:"hosts"},canonicalPath:"/chat/hosts",webPath:"/admin/chat?room=hosts",access:"signed-host-roster",transport:null};
  if(intent.kind==="guide") {
    if(!/^[a-f0-9]{64}$/i.test(registry.guidePubkey??""))return {version:1,state:"unavailable"};
    return {version:1,state:"resolved",target:{version:1,kind:"guide"},canonicalPath:"/chat/guide",webPath:"/admin/chat?room=guide",access:"account-inbox",transport:{protocol:"nip17",pubkey:registry.guidePubkey!.toLowerCase()}};
  }
  if(intent.kind==="global") {
    const destination=validNip29Destination(registry.config.global);
    return destination?{version:1,state:"resolved",target:{version:1,kind:"global"},canonicalPath:"/chat/global",webPath:"/admin/chat?room=global",access:"public-membership",transport:{protocol:"nip29",destination}}:{version:1,state:"unavailable"};
  }
  if(intent.kind!=="city")return {version:1,state:"invalid"};
  const byId=registry.cities.find(row=>row.revision.city.cityId===intent.city);
  const route=byId?{row:byId,canonicalSlug:byId.revision.city.slug}:resolveCityRoute(registry.cities,intent.city);
  if(!route)return {version:1,state:"not-found"};
  const city=route.row.revision.city;
  if(isReservedChatSlug(city.slug))return {version:1,state:"unavailable"};
  const chat=resolveCityChat(city.cityId,city.slug,registry.config);
  // Never silently turn a missing city room into Global.
  const destination=chat.scope==="city"?validNip29Destination(chat.nip29):null;
  if(!destination)return {version:1,state:"unavailable"};
  const target:ChatTarget={version:1,kind:"city",cityId:city.cityId};
  return {version:1,state:"resolved",target,canonicalPath:chatTargetPath(target,city.slug),webPath:`/admin/chat?city=${encodeURIComponent(city.slug)}`,access:"public-membership",transport:{protocol:"nip29",destination}};
}

export async function loadChatTarget(path:string):Promise<ChatTargetResolution> {
  const intent=parseChatPath(path);
  if(!intent)return {version:1,state:"invalid"};
  try {
    return resolveChatTarget(path,{
      cities:intent.kind==="city"?await loadSharedCities():[],
      config:serverChatConfig(),guidePubkey:process.env.BITCOINWALK_GUIDE_PUBKEY,
    });
  }catch{return {version:1,state:"unavailable"};}
}

export function chatResolutionStatus(result:ChatTargetResolution):number {
  return result.state==="invalid"?400:result.state==="not-found"?404:result.state==="unavailable"?503:200;
}

export async function serveChatLink(request:Request):Promise<Response> {
  const path=new URL(request.url).pathname,result=await loadChatTarget(path);
  const headers={"Cache-Control":"no-store","X-Robots-Tag":"noindex"};
  if(result.state!=="resolved")return Response.json(result,{status:chatResolutionStatus(result),headers});
  // Query parameters cannot override the resolved target or convey authority.
  const destination=path===result.canonicalPath?result.webPath:result.canonicalPath;
  // Relative redirects retain the browser's HTTPS origin behind a reverse
  // proxy; Next's server-side request URL may carry an internal host/port.
  return new Response(null,{status:307,headers:{...headers,Location:destination}});
}
