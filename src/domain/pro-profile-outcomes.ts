import type {CityIdentityHealth} from "../server/pro-city-identity-health";

export type ProProfileOutcomes={checked:number;complete:number;actionRequired:number;unknown:number;checkedAt:number};

/** Current verified Pro profiles, deliberately separate from the 90-day setup cohort. */
export function proProfileOutcomes(rows:CityIdentityHealth[],checkedAt:number):ProProfileOutcomes{
 const cities=new Map<string,CityIdentityHealth[]>();
 for(const row of rows){
  if(!row.availableInEnvironment||row.tier!=="pro")continue;
  cities.set(row.cityId,[...(cities.get(row.cityId)??[]),row]);
 }
 let complete=0,actionRequired=0,unknown=0;
 for(const evidence of cities.values()){
  // Conflicting duplicates are unknown, not an extra city or a successful check.
  const statuses=new Set(evidence.map(row=>row.status));
  if(statuses.size!==1){unknown++;continue;}
  const status=evidence[0].status;
  if(status==="complete")complete++;
  else if(status==="action-required"||status==="not-configured")actionRequired++;
  else unknown++;
 }
 return {checked:cities.size,complete,actionRequired,unknown,checkedAt};
}
