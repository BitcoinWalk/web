import { compareEvents, SimplePool, verifyEvent, type Event, type EventTemplate, type Filter, type VerifiedEvent } from "nostr-tools";
import {
  ADMIN_APPROVAL_KIND,
  CITY_UPDATE_KIND,
  cityApprovalSchema,
  cityDocumentSchema,
  type CityApproval,
  type CityDocument,
} from "../domain/city";
import { isSuperAdmin, SUPER_ADMIN_PUBKEY } from "./authority";
import { CITY_AUTHORIZATION_KIND, cityAuthorizationSchema, type CityAuthorization } from "../domain/city";

function uniqueTag(event: Event, name: string, value: string): boolean {
  const tags = event.tags.filter(tag => tag[0] === name);
  return tags.length === 1 && tags[0][1] === value;
}

function workflowAddress(event: Event, cityId: string): boolean {
  const tags = event.tags.filter(tag => tag[0] === "d");
  if (tags.length !== 1) return false;
  const d = tags[0][1];
  return d === cityId || (d?.startsWith(`${cityId}:`) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(d.slice(cityId.length + 1)));
}

export type AuthorizationRecord = { event: Event; grant: CityAuthorization };
export function parseAuthorizationRecord(event: Event): AuthorizationRecord | null {
  if (event.kind !== CITY_AUTHORIZATION_KIND || !verifyEvent(event) || !isSuperAdmin(event.pubkey)) return null;
  try {
    const grant = cityAuthorizationSchema.parse(JSON.parse(event.content));
    return uniqueTag(event, "d", grant.cityId) && isSuperAdmin(grant.superAdminPubkey) ? { event, grant } : null;
  } catch { return null; }
}

export async function queryCalendarEvents(relays:string[], filter:{ids?:string[];cityId?:string;authors?:string[]}={}):Promise<Event[]> {
  return queryRelayEvents(relays,[31923],undefined,{...(filter.authors?{authors:filter.authors}:{}),...(filter.ids?{ids:filter.ids}:{}),...(filter.cityId?{"#i":[filter.cityId]}:{})});
}

export async function queryCalendarDeletion(relays:string[], id:string):Promise<Event[]> {
  return (await queryRelayEvents(relays,[5],undefined,{authors:[SUPER_ADMIN_PUBKEY],"#e":[id]})).filter(e=>verifyEvent(e)&&isSuperAdmin(e.pubkey)&&e.tags.some(t=>t[0]==="k"&&t[1]==="31923"));
}

export async function queryAuthorizations(relays: string[]): Promise<AuthorizationRecord[]> {
  const events = await queryRelayEvents(relays, [CITY_AUTHORIZATION_KIND], undefined, {authors:[SUPER_ADMIN_PUBKEY]});
  const records=events.map(parseAuthorizationRecord).filter((r): r is AuthorizationRecord=>r!==null);
  if(events.length && !records.length) throw new Error("The relay returned city lists, but none passed signature/schema verification. No permissions were changed.");
  return records.sort((a,b)=>compareEvents(a.event,b.event));
}

export async function queryCityAuthorization(relays: string[], cityId: string): Promise<AuthorizationRecord | null> {
  const events = await queryRelayEvents(relays, [CITY_AUTHORIZATION_KIND], undefined, { authors: [SUPER_ADMIN_PUBKEY], "#d": [cityId] });
  return events.map(parseAuthorizationRecord).filter((r): r is AuthorizationRecord => r !== null && r.grant.cityId === cityId).sort((a,b)=>compareEvents(a.event,b.event))[0] ?? null;
}

export type CityRevision = { event: Event; city: CityDocument };
export type ApprovalRecord = { event: Event; approval: CityApproval };
export type RelayReadAuthentication = (template: EventTemplate) => Promise<VerifiedEvent>;

export function parseCityRevision(event: Event): CityRevision | null {
  if (event.kind !== CITY_UPDATE_KIND || !verifyEvent(event)) return null;
  try {
    const parsed = cityDocumentSchema.safeParse(JSON.parse(event.content));
    return parsed.success && workflowAddress(event, parsed.data.cityId) && uniqueTag(event, "city", parsed.data.slug) ? { event, city: parsed.data } : null;
  } catch {
    return null;
  }
}

export function parseApprovalRecord(event: Event): ApprovalRecord | null {
  if (event.kind !== ADMIN_APPROVAL_KIND || !verifyEvent(event) || !isSuperAdmin(event.pubkey)) return null;
  try {
    const parsed = cityApprovalSchema.safeParse(JSON.parse(event.content));
    if (!parsed.success) return null;
    const data = parsed.data;
    return workflowAddress(event, data.cityId) && (uniqueTag(event, "d", data.cityId) || uniqueTag(event, "i", data.cityId)) && uniqueTag(event, "status", data.status) && event.tags.filter(t => t[0] === "e" && t[1] === data.cityRevisionId && t[3] === "city-revision").length === 1 ? { event, approval: data } : null;
  } catch {
    return null;
  }
}

let readPool: SimplePool | undefined;
let activeReads=0;
let idleClose: ReturnType<typeof setTimeout> | undefined;

async function queryRelayEvents(relays: string[], kinds: number[], onAuthentication?: RelayReadAuthentication, filter: Partial<Filter> = {}): Promise<Event[]> {
  if (relays.length === 0) throw new Error("No read relay configured.");
  if(idleClose) clearTimeout(idleClose);
  const pool=readPool ?? (readPool=new SimplePool());
  activeReads++;
  try {
    return await new Promise<Event[]>((resolve,reject) => {
      const events: Event[] = [];
      let settled=false;
      const timeout=setTimeout(()=>{
        if(settled)return;
        settled=true;
        reject(new Error("Relay read timed out. City lists could not be confirmed. Please retry; do not recreate the city."));
        subscription?.close("read timeout");
      },10_000);
      const subscription=pool.subscribeEose(relays, { kinds, limit: 500, ...filter }, {
        // Our timeout rejects before the library's synthetic EOSE timeout.
        maxWait: 12_000,
        onauth: onAuthentication,
        onevent: (event) => events.push(event),
        onclose: (reasons) => {
          if(settled)return;
          settled=true;clearTimeout(timeout);
          if(!reasons?.length || reasons.some(r=>r.reason!=="closed automatically on eose")) {
            reject(new Error("Could not read the relay: "+(reasons?.map(r=>`${r.url}: ${r.reason}`).join("; ") || "connection closed")+". If temporarily rate-limited, wait five minutes before retrying. Do not recreate cities; no permissions were changed."));
          } else resolve(events);
        },
      });
    });
  } finally {
    activeReads--;
    if(activeReads===0) idleClose=setTimeout(()=>{
      pool.destroy();
      if(readPool===pool)readPool=undefined;
    },5*60_000);
  }
}

/** Public lookup is scoped to a city, then fetches exact approved IDs. Historical
 * snapshots must not disappear merely because newer drafts fill a query page.
 * New decision timestamps are strictly increasing per city on the managed relay.
 */
export async function queryPublishedCity(relays: string[], slug: string): Promise<CityRevision | null> {
  const candidates = (await queryRelayEvents(relays, [CITY_UPDATE_KIND], undefined, { "#city": [slug], limit: 200 }))
    .map(parseCityRevision).filter((r): r is CityRevision => r !== null);
  const cityIds = [...new Set(candidates.map(r => r.city.cityId))];
  const approvals: ApprovalRecord[] = [];
  for (const cityId of cityIds) {
    const legacy = await queryRelayEvents(relays, [ADMIN_APPROVAL_KIND], undefined, { authors: [SUPER_ADMIN_PUBKEY], "#d": [cityId] });
    approvals.push(...legacy.map(parseApprovalRecord).filter((r): r is ApprovalRecord => r !== null));
    let until: number | undefined;
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error("City decision history exceeds the safe read limit.");
      const events = await queryRelayEvents(relays, [ADMIN_APPROVAL_KIND], undefined, { authors: [SUPER_ADMIN_PUBKEY], "#i": [cityId], limit: 200, ...(until === undefined ? {} : { until }) });
      approvals.push(...events.map(parseApprovalRecord).filter((r): r is ApprovalRecord => r !== null && r.approval.cityId === cityId));
      if (events.length < 200) break;
      const oldest = Math.min(...events.map(e => e.created_at));
      // Keep the boundary second in the next page; no records are skipped.
      if (until !== undefined && oldest >= until) throw new Error("City decision history could not be read completely.");
      until = oldest;
    }
  }
  const snapshots = [...candidates];
  const ids = [...new Set(approvals.filter(r => r.approval.status === "approved").map(r => r.approval.cityRevisionId))];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const events = await queryRelayEvents(relays, [CITY_UPDATE_KIND], undefined, { ids: ids.slice(offset, offset + 100), limit: 100 });
    snapshots.push(...events.map(parseCityRevision).filter((r): r is CityRevision => r !== null));
  }
  return resolveApprovedCity(snapshots, approvals, slug);
}

export async function queryCityRevisions(relays: string[], onAuthentication?: RelayReadAuthentication): Promise<CityRevision[]> {
  const events = await queryRelayEvents(relays, [CITY_UPDATE_KIND], onAuthentication);
  return events.map(parseCityRevision).filter((record): record is CityRevision => record !== null);
}

export async function queryApprovals(relays: string[], onAuthentication?: RelayReadAuthentication): Promise<ApprovalRecord[]> {
  const events = await queryRelayEvents(relays, [ADMIN_APPROVAL_KIND], onAuthentication);
  return events.map(parseApprovalRecord).filter((record): record is ApprovalRecord => record !== null && isSuperAdmin(record.event.pubkey));
}

/** Complete bounded history for discovery; never publish a partial directory
 * that could omit a later revocation. Inclusive boundaries avoid skipping ties.
 */
export async function queryDirectoryRecords(relays:string[]):Promise<{revisions:CityRevision[];approvals:ApprovalRecord[]}> {
  async function history(kind:number):Promise<Event[]> {
    const collected=new Map<string,Event>();
    let until:number|undefined;
    for(let page=0;page<100;page++) {
      const events=await queryRelayEvents(relays,[kind],undefined,{limit:200,...(kind===ADMIN_APPROVAL_KIND?{authors:[SUPER_ADMIN_PUBKEY]}:{}),...(until===undefined?{}:{until})});
      for(const event of events)collected.set(event.id,event);
      if(events.length<200)return [...collected.values()];
      const oldest=Math.min(...events.map(e=>e.created_at));
      if(until!==undefined && oldest>=until)throw new Error("Directory history cannot be read completely. Please try again later.");
      until=oldest;
    }
    throw new Error("Directory history exceeds the supported read limit.");
  }
  const [revisions,approvals]=await Promise.all([history(CITY_UPDATE_KIND),history(ADMIN_APPROVAL_KIND)]);
  return {revisions:revisions.map(parseCityRevision).filter((r):r is CityRevision=>r!==null),approvals:approvals.map(parseApprovalRecord).filter((r):r is ApprovalRecord=>r!==null)};
}

/** Rejection concerns one revision; revocation hides the city until reapproved.
 * Never fall back to an older approval when the selected snapshot is missing.
 */
export function resolveApprovedCity(revisions: CityRevision[], approvals: ApprovalRecord[], slug: string): CityRevision | null {
  const latest = new Map<string, CityApproval>();
  const rejected = new Map<string, Set<string>>();
  for (const record of [...approvals].sort((a,b) => compareEvents(a.event,b.event))) {
    const decision = record.approval;
    if (latest.has(decision.cityId)) continue;
    if (decision.status === "rejected") {
      const ids = rejected.get(decision.cityId) ?? new Set<string>();
      ids.add(decision.cityRevisionId);
      rejected.set(decision.cityId, ids);
    } else {
      latest.set(decision.cityId, rejected.get(decision.cityId)?.has(decision.cityRevisionId)
        ? { ...decision, status: "rejected" } : decision);
    }
  }

  return revisions
    .filter((revision) => {
      const decision = latest.get(revision.city.cityId);
      return revision.city.slug === slug && decision?.status === "approved" && decision.cityRevisionId === revision.event.id;
    })
    .sort((left, right) => compareEvents(left.event, right.event))[0] ?? null;
}

export function pendingCityRevisions(revisions: CityRevision[], approvals: ApprovalRecord[]): CityRevision[] {
  const decidedRevisionIds = new Set(approvals.map(({ approval }) => approval.cityRevisionId));
  return revisions.filter((revision) => !decidedRevisionIds.has(revision.event.id)).sort((left, right) => compareEvents(left.event, right.event));
}
