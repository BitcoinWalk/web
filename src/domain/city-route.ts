import {registrationSlug} from "./registration";

type CityRouteRow={revision:{city:{cityId:string;cityName?:string;slug:string;aliases?:string[]}}};

export type ResolvedCityRoute<T extends CityRouteRow>={row:T;canonicalSlug:string;redirect:boolean};

/** Canonical slugs always win. An alternative name routes only when it resolves
 * to exactly one approved city; ambiguous aliases fail closed. */
export function resolveCityRoute<T extends CityRouteRow>(rows:T[],requestedPath:string):ResolvedCityRoute<T>|null{
 const requested=registrationSlug(requestedPath);if(!requested)return null;
 const canonical=rows.find(row=>row.revision.city.slug===requested);
 if(canonical)return {row:canonical,canonicalSlug:canonical.revision.city.slug,redirect:requestedPath!==canonical.revision.city.slug};
 const aliases=rows.filter(row=>row.revision.city.aliases?.some(alias=>registrationSlug(alias)===requested));
 const unique=[...new Map(aliases.map(row=>[row.revision.city.cityId,row])).values()];
 if(unique.length!==1)return null;
 return {row:unique[0],canonicalSlug:unique[0].revision.city.slug,redirect:true};
}

/** Approved duplicate records can temporarily coexist while a paid city is
 * reconciled onto its durable identity. Treat them as one route only when both
 * the canonical slug and normalized display name agree; the selected row still
 * owns presentation while every member remains available for signed-event
 * verification. */
export function cityRouteFamily<T extends CityRouteRow>(rows:T[],selected:T):T[]{
 const city=selected.revision.city,name=city.cityName?.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
 return rows.filter(row=>{
  const candidate=row.revision.city;
  if(candidate.cityId===city.cityId)return true;
  const candidateName=candidate.cityName?.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
  return candidate.slug===city.slug&&!!name&&candidateName===name;
 });
}
