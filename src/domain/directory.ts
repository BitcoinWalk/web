import { resolveApprovedCity, type CityRevision, type ApprovalRecord } from "../nostr/city-records";
import type { CityDocument } from "./city";
export type PaidDirectoryCity={slug:string;featured:boolean;subdomainReady:boolean};
export type DirectoryCity={city:CityDocument;href:string;tier:"free"|"paid";featured:boolean};
export function approvedDirectory(revisions:CityRevision[],approvals:ApprovalRecord[],paid:Record<string,PaidDirectoryCity>):DirectoryCity[] {
  const ids=[...new Set(revisions.map(r=>r.city.cityId))];
  const rows:DirectoryCity[]=[];
  for(const id of ids) {
    const versions=revisions.filter(r=>r.city.cityId===id);
    const decisions=approvals.filter(r=>r.approval.cityId===id);
    for(const slug of new Set(versions.map(r=>r.city.slug))) {
      const chosen=resolveApprovedCity(versions,decisions,slug);
      if(!chosen)continue;
      const entitlement=Object.hasOwn(paid,id)&&paid[id].slug===slug?paid[id]:undefined;
      rows.push({city:chosen.city,href:entitlement?.subdomainReady?`https://${slug}.bitcoinwalk.org`:`/${encodeURIComponent(slug)}`,tier:entitlement?"paid":"free",featured:!!entitlement?.featured});
    }
  }
  // Slug collisions need administrator review; don't send visitors to a different city.
  return rows.filter(row=>rows.filter(other=>other.city.slug===row.city.slug).length===1).sort((a,b)=>a.city.cityName.localeCompare(b.city.cityName));
}
export function filterDirectory(rows:DirectoryCity[],query:string):DirectoryCity[] {
  const normalize=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const q=normalize(query.trim());
  return rows.filter(r=>normalize(`${r.city.cityName} ${r.city.meetingPoint.description}`).includes(q));
}
export function directoryImage(value:string|undefined):string|undefined {
  try {const url=new URL(value??"");return url.protocol==="https:"&&!url.username&&!url.password?url.href:undefined;}catch{return;}
}
