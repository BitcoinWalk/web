import type {CalendarWalk} from "../nostr/calendar-records";

export type WalkListStatus="draft"|"upcoming"|"past"|"canceled";
export const DEFAULT_WALK_LIST_STATUSES:WalkListStatus[]=["upcoming","draft"];
type ListRow={kind:WalkListStatus;key:string;at:number;walk:CalendarWalk};
export type WalkListFilter="all"|"next"|"upcoming"|"past";

export function filterWalkRows<T extends ListRow>(rows:T[],filter:WalkListFilter):T[]{
  if(filter==="all")return [...rows];
  if(filter==="upcoming"||filter==="past")return rows.filter(row=>row.kind===filter);
  const next=new Map<string,T>();
  for(const row of rows){
    if(row.kind!=="upcoming")continue;
    const cityId=row.walk.revision.city.cityId,current=next.get(cityId);
    if(!current||row.at<current.at||row.at===current.at&&row.key.localeCompare(current.key)<0)next.set(cityId,row);
  }
  return [...next.values()];
}

export function groupWalkRows<T extends ListRow>(rows:T[],visibleStatuses:ReadonlySet<WalkListStatus>):[string,{name:string;rows:T[]}][] {
  const groups=new Map<string,{name:string;rows:T[]}>();
  for(const row of rows){
    if(!visibleStatuses.has(row.kind))continue;
    const city=row.walk.revision.city;
    const group=groups.get(city.cityId)??{name:city.cityName,rows:[]};
    group.rows.push(row);groups.set(city.cityId,group);
  }
  const cities=[...groups.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name));
  for(const [,city] of cities)city.rows.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));
  return cities;
}
