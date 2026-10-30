import { resolveApprovedCity, type CityRevision, type ApprovalRecord } from "../nostr/city-records";
import type { CityDocument } from "./city";
export type PaidDirectoryCity={slug:string;featured:boolean;subdomainReady:boolean;cityName?:string;aliases?:string[];relayMode?:"dedicated"|"migrated"};
export type DirectoryCity={city:CityDocument;href:string;tier:"free"|"paid";featured:boolean;hasUpcomingWalk:boolean;timeZone?:string};
export type DirectoryOccurrence={start:number;status:"active"|"grace"|"upcoming"|"past";meetingPoint:CityDocument["meetingPoint"];heroImageUrl?:string;timeZone?:string|null};
export function approvedDirectory(revisions:CityRevision[],approvals:ApprovalRecord[],paid:Record<string,PaidDirectoryCity>):DirectoryCity[] {
  const ids=[...new Set(revisions.map(r=>r.city.cityId))];
  const rows:DirectoryCity[]=[];
  for(const id of ids) {
    const versions=revisions.filter(r=>r.city.cityId===id);
    const decisions=approvals.filter(r=>r.approval.cityId===id);
    for(const slug of new Set([...versions.map(r=>r.city.slug),...decisions.map(r=>r.approval.slug).filter((value):value is string=>!!value)])) {
      const chosen=resolveApprovedCity(versions,decisions,slug);
      if(!chosen)continue;
      const entitlement=Object.hasOwn(paid,id)&&paid[id].slug===slug?paid[id]:undefined;
      rows.push({city:chosen.city,href:`/${encodeURIComponent(slug)}`,tier:entitlement?"paid":"free",featured:!!entitlement?.featured,hasUpcomingWalk:false});
    }
  }
  // Slug collisions need administrator review; don't send visitors to a different city.
  return rows.filter(row=>rows.filter(other=>other.city.slug===row.city.slug).length===1).sort((a,b)=>a.city.cityName.localeCompare(b.city.cityName));
}
export function filterDirectory(rows:DirectoryCity[],query:string):DirectoryCity[] {
  const normalize=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const q=normalize(query.trim());
  return rows.filter(r=>normalize(`${r.city.cityName} ${(r.city.aliases??[]).join(" ")} ${r.city.meetingPoint.description}`).includes(q));
}
/** Retain every approved city on the homepage map. When a current or upcoming
 * signed occurrence exists, use its exact date and meeting point on the card. */
export function directoryWithWalkSchedule(rows:DirectoryCity[],occurrences:ReadonlyMap<string,DirectoryOccurrence>):DirectoryCity[] {
  return rows.map(row=>{
    const occurrence=occurrences.get(row.city.cityId);
    if(!occurrence||(occurrence.status!=="active"&&occurrence.status!=="upcoming"))return row;
    return {...row,hasUpcomingWalk:true,...(occurrence.timeZone?{timeZone:occurrence.timeZone}:{}),city:{...row.city,startAt:new Date(occurrence.start*1000).toISOString(),meetingPoint:{...occurrence.meetingPoint},...(occurrence.heroImageUrl?{heroImageUrl:occurrence.heroImageUrl}:{})}};
  });
}
export function directoryWalkDate(startAt:string,timeZone?:string,locale?:string):string {
  const options:Intl.DateTimeFormatOptions={dateStyle:"medium",timeStyle:"short",...(timeZone?{timeZone}:{})};
  try{return new Intl.DateTimeFormat(locale,options).format(new Date(startAt));}
  catch{return new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(startAt));}
}
export function directoryImage(value:string|undefined):string|undefined {
  try {const url=new URL(value??"");return url.protocol==="https:"&&!url.username&&!url.password?url.href:undefined;}catch{return;}
}
/** Prefer the current environment's content-addressed copy for BitcoinWalk-managed
 * media. The signed source URL remains a safe fallback for local development and
 * for a temporarily incomplete replica. */
export function directoryImageCandidates(value:string|undefined):string[] {
  if(value?.startsWith("/")&&!value.startsWith("//"))return [value];
  const image=directoryImage(value);if(!image)return [];
  const url=new URL(image),managed=/^\/api\/media\/files\/[a-f0-9]{64}\.webp$/.test(url.pathname)&&
    (url.hostname==="bitcoinwalk.org"||url.hostname==="app-staging.bitcoinwalk.org");
  return managed?[url.pathname,image]:[image];
}
