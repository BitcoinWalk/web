import { compareEvents } from "nostr-tools";
import { cityDocumentSchema, type CityAuthorization, type CityDocument } from "../domain/city";
import { isSuperAdmin } from "./authority";
import type { ApprovalRecord, AuthorizationRecord, CityRevision } from "./city-records";
import { archivedCityIds } from "./moderation";

export function canEditCity(pubkey: string, grant: CityAuthorization): boolean {
  return isSuperAdmin(pubkey) || grant.creatorPubkey === pubkey || grant.editorPubkeys.includes(pubkey);
}

/** Only registered cities and the newest grant per city are used. */
export function editableCityRevisions(pubkey: string, grants: AuthorizationRecord[], revisions: CityRevision[], approvals: ApprovalRecord[] = []): CityRevision[] {
  const archived = archivedCityIds(approvals);
  const latestGrants = new Map<string, CityAuthorization>();
  for (const record of [...grants].sort((a,b) => compareEvents(a.event,b.event))) {
    if (!latestGrants.has(record.grant.cityId)) latestGrants.set(record.grant.cityId, record.grant);
  }
  const cities = new Map<string, CityRevision>();
  for (const revision of [...revisions].sort((a,b) => compareEvents(a.event,b.event))) {
    if (archived.has(revision.city.cityId)) continue;
    const grant = latestGrants.get(revision.city.cityId);
    if (grant && canEditCity(pubkey,grant) && canEditCity(revision.event.pubkey,grant) && !cities.has(grant.cityId)) cities.set(grant.cityId,revision);
  }
  return [...cities.values()].sort((a,b) => a.city.cityName.localeCompare(b.city.cityName));
}

export type WalkEdits = Pick<CityDocument, "startAt" | "description" | "meetingPoint" | "heroImageUrl">;
export function editedCity(base: CityDocument, edits: WalkEdits): CityDocument {
  // Do not spread arbitrary input over identity, chat entitlements or sponsorship.
  return cityDocumentSchema.parse({...base, startAt: edits.startAt, description: edits.description, meetingPoint: edits.meetingPoint, heroImageUrl: edits.heroImageUrl});
}

export function localDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
