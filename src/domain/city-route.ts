import {registrationSlug} from "./registration";

type CityRouteRow={revision:{city:{cityId:string;slug:string;aliases?:string[]}}};

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
