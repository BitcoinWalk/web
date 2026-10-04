import {queryPublishedCity} from "../nostr/city-records";
import {serverReadRelays} from "../lib/server-relay-config";
import {getLogoCatalog} from "./runtime";
import type {LogoPack} from "./catalog";

export async function loadPublishedLogoPack(slug:string):Promise<LogoPack|null>{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;
  const revision=await queryPublishedCity(serverReadRelays(),slug);
  if(!revision)return null;
  return getLogoCatalog().ready({cityId:revision.city.cityId,revisionId:revision.event.id,slug:revision.city.slug});
}
