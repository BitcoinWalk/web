import {queryPublishedCity} from "../nostr/city-records";
import {serverReadRelays} from "../lib/server-relay-config";
import {getLogoCatalog} from "./runtime";
import type {LogoPack} from "./catalog";

export async function loadPublishedLogoPack(slug:string):Promise<LogoPack|null>{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;
  const revision=await queryPublishedCity(serverReadRelays(),slug);
  if(!revision)return null;
  // Presentation decisions may replace a legacy city slug (for example,
  // wurzburg -> wuerzburg). Logo jobs are keyed to the approved presentation
  // slug, not necessarily the slug embedded in the older city revision.
  return getLogoCatalog().readyForCity({cityId:revision.city.cityId,slug});
}
