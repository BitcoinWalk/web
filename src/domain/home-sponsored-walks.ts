export type HomeSponsoredWalk={
 cityId:string;
 cityName:string;
 eventId:string;
 href:string;
 imageUrl?:string;
 meetingPoint:string;
 sponsorPubkey:string;
 start:number;
 timeZone:string|null;
};

/** Keep the quiet homepage preview diverse: at most one walk per city until
 * the visitor explicitly asks to see the complete date-ordered inventory. */
export function sponsoredWalkPreview(rows:HomeSponsoredWalk[],limit=3):HomeSponsoredWalk[]{
 if(!Number.isSafeInteger(limit)||limit<1)return [];
 const cities=new Set<string>(),result:HomeSponsoredWalk[]=[];
 for(const row of rows){
  if(cities.has(row.cityId))continue;
  cities.add(row.cityId);result.push(row);
  if(result.length===limit)break;
 }
 return result;
}
