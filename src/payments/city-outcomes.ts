import type {DatabaseSync} from "node:sqlite";

export type CityOutcomeReport = {status:"unavailable"} | {
 status:"available";started:number;preparationReady:number;identityPublished:number;servicesActive:number;needsAttention:number;
};

/** Read-only current-state cohort, not a historical event funnel or live health probe.
 * No identifiers or raw provider errors leave this function. */
export function cityOutcomeReport(db:DatabaseSync,from:number,to:number):CityOutcomeReport{
 try{
  const tables=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  if(!["pro_setup_task","city_brand_request","city_brand_publication","rustress_activation_task"].every(name=>tables.has(name)))return {status:"unavailable"};
  const rows=db.prepare(`SELECT
   (t.state='ready-for-proof' AND t.payoutVersion IS NOT NULL AND t.brandPubkey IS NOT NULL
    AND t.backupAcknowledgedAt IS NOT NULL AND t.artworkRevisionId IS NOT NULL
    AND t.artworkAvatar IS NOT NULL AND t.artworkBanner IS NOT NULL) preparationReady,
   (r.status='active' AND p.event_id IS NOT NULL) identityPublished,
   (r.status='active' AND p.event_id IS NOT NULL AND a.phase='active' AND a.nip05='active' AND a.lnurl='active') servicesActive,
   (a.phase IN ('blocked','needs-attention','unknown') OR a.nip05='needs-attention' OR a.lnurl='needs-attention') needsAttention
   FROM pro_setup_task t
   LEFT JOIN city_brand_request r ON r.rowid=(SELECT MAX(candidate.rowid) FROM city_brand_request candidate WHERE candidate.city_id=t.cityId)
    AND json_extract(CASE WHEN json_valid(r.challenge) THEN r.challenge ELSE '{}' END,'$.authority.ownerPubkey')=t.currentOwnerPubkey
    AND json_extract(CASE WHEN json_valid(r.challenge) THEN r.challenge ELSE '{}' END,'$.authority.entitlementId')=t.entitlementId
    AND json_extract(CASE WHEN json_valid(r.challenge) THEN r.challenge ELSE '{}' END,'$.binding.brandPubkey')=t.brandPubkey
   LEFT JOIN city_brand_publication p ON p.request_id=r.id
    AND p.event_id=json_extract(CASE WHEN json_valid(r.approved_event) THEN r.approved_event ELSE '{}' END,'$.id')
   LEFT JOIN rustress_activation_task a ON a.city=t.cityId AND a.request=r.id
    AND json_extract(CASE WHEN json_valid(a.activation_config) THEN a.activation_config ELSE '{}' END,'$.payoutVersion')=t.payoutVersion
   WHERE t.createdAt>=? AND t.createdAt<=?`).all(from,to) as Array<Record<string,number|null>>;
  const count=(key:string)=>rows.filter(row=>row[key]===1).length;
  return {status:"available",started:rows.length,preparationReady:count("preparationReady"),identityPublished:count("identityPublished"),servicesActive:count("servicesActive"),needsAttention:count("needsAttention")};
 }catch{return {status:"unavailable"};}
}
