import {compareEvents,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {CONTENT_PAGE_KIND,contentPageSchema,type ContentPage} from "../domain/content";
import {isSuperAdmin,SUPER_ADMIN_PUBKEY} from "./authority";
import {queryRelayEvents} from "./city-records";

export type ContentRevision={event:Event;page:ContentPage};
function one(event:Event,name:string){const tags=event.tags.filter(tag=>tag[0]===name&&tag.length===2);return tags.length===1?tags[0][1]:null;}
export function parseContentRevision(event:Event):ContentRevision|null{
 if(event.kind!==CONTENT_PAGE_KIND||!verifyEvent(event)||!isSuperAdmin(event.pubkey))return null;
 try{const parsed=contentPageSchema.safeParse(JSON.parse(event.content));if(!parsed.success)return null;const page=parsed.data,d=one(event,"d"),i=one(event,"i"),slug=one(event,"page"),status=one(event,"status"),client=one(event,"client"),previous=event.tags.filter(tag=>tag[0]==="e"&&tag.length===4&&tag[2]===""&&tag[3]==="previous");const exact=event.tags.every(tag=>["d","i","page","status","client"].includes(tag[0])?tag.length===2:tag[0]==="e"&&tag.length===4&&tag[2]===""&&tag[3]==="previous");return exact&&client==="bitcoinwalk.org"&&previous.length===(page.previousRevisionId?1:0)&&(!page.previousRevisionId||previous[0][1]===page.previousRevisionId)&&d?.startsWith(`${page.pageId}:`)&&i===page.pageId&&slug===(page.slug||"/")&&status===(page.published?"published":"unpublished")?{event,page}:null;}catch{return null;}
}
export function createContentRevision(page:ContentPage):EventTemplate{
 const value=contentPageSchema.parse(page);return {kind:CONTENT_PAGE_KIND,created_at:Math.floor(Date.now()/1000),content:JSON.stringify(value),tags:[["d",`${value.pageId}:${crypto.randomUUID()}`],["i",value.pageId],["page",value.slug||"/"],["status",value.published?"published":"unpublished"],["client","bitcoinwalk.org"],...(value.previousRevisionId?[["e",value.previousRevisionId,"","previous"]]:[])]};
}
export function latestContentPages(revisions:ContentRevision[]):ContentRevision[]{
 const latest=new Map<string,ContentRevision>();for(const revision of [...revisions].sort((a,b)=>compareEvents(a.event,b.event)))if(!latest.has(revision.page.pageId))latest.set(revision.page.pageId,revision);
 return [...latest.values()].sort((a,b)=>(a.page.slug||" ").localeCompare(b.page.slug||" "));
}
export async function queryContentRevisions(relays:string[]):Promise<ContentRevision[]>{const events=await queryRelayEvents(relays,[CONTENT_PAGE_KIND],undefined,{authors:[SUPER_ADMIN_PUBKEY],limit:500});if(events.length>=500)throw new Error("Content history reached its read limit.");return events.map(parseContentRevision).filter((row):row is ContentRevision=>row!==null);}
export function contentRoute(revisions:ContentRevision[],slug:string):{page:ContentRevision}|{redirect:string}|null{
 const latest=latestContentPages(revisions),current=latest.find(row=>row.page.slug===slug&&row.page.published);if(current)return {page:current};const historical=revisions.find(row=>row.page.slug===slug);if(!historical)return null;const target=latest.find(row=>row.page.pageId===historical.page.pageId);return target?.page.published?{redirect:`/${target.page.slug}`} : null;
}
