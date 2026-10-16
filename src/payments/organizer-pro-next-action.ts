import type {DatabaseSync} from "node:sqlite";
export type OrganizerProNextAction={cityId:string;cityName:string;state:"confirm-payout"|"connect-city-signer"|"submit-activation"|"awaiting-review"|"awaiting-publication"};
type SetupRow={cityId:string;cityName:string;state:"setup-required"|"payout-confirmed"|"signer-confirmed"|"ready-for-proof"};type RequestRow={status:string;expiresAt:number;ownerProof:string|null;brandProof:string|null};
/** Durable Pro inventory for the super-admin city workspace. This must not
 * depend on invoice visibility: imported legacy cities have no invoice. */
export function adminProCityIds(db:DatabaseSync):string[]{
 const legacy=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_pro_entitlement'").get();
 return (db.prepare(`SELECT cityId FROM paid_city_entitlement${legacy?" UNION SELECT cityId FROM legacy_pro_entitlement":""} ORDER BY cityId`).all() as Array<{cityId:string}>).map(row=>row.cityId);
}
/** Current ownership, rather than the historical invoice owner, controls which
 * paid-city workspace an organizer can open. */
export function organizerProCityIds(db:DatabaseSync,actor:string):string[]{
 if(!/^[0-9a-f]{64}$/.test(actor))return[];
 const legacy=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_pro_entitlement'").get();
 return (db.prepare(`SELECT task.cityId FROM pro_setup_task task WHERE task.currentOwnerPubkey=? AND (EXISTS(
  SELECT 1 FROM paid_city_entitlement entitlement WHERE entitlement.cityId=task.cityId AND entitlement.invoiceId=task.entitlementId)${legacy?` OR EXISTS(
  SELECT 1 FROM legacy_pro_entitlement entitlement WHERE entitlement.cityId=task.cityId AND entitlement.entitlementId=task.entitlementId)`:""})${legacy?` UNION
  SELECT cityId FROM legacy_pro_entitlement WHERE originalOwnerPubkey=?`:""} UNION
  SELECT entitlement.cityId FROM paid_city_entitlement entitlement WHERE entitlement.owner=? AND NOT EXISTS(
   SELECT 1 FROM pro_setup_task task WHERE task.cityId=entitlement.cityId) ORDER BY cityId`).all(...(legacy?[actor,actor,actor]:[actor,actor])) as Array<{cityId:string}>).map(row=>row.cityId);
}
/** Owner-only, non-secret projection for the first dashboard action after login. */
export function organizerProNextActions(db:DatabaseSync,actor:string,now=Math.floor(Date.now()/1000)):OrganizerProNextAction[]{
 if(!/^[0-9a-f]{64}$/.test(actor))return[];const rows=db.prepare(`SELECT task.cityId,invoice.cityName,task.state FROM pro_setup_task task JOIN payment_invoice invoice ON invoice.id=task.entitlementId WHERE task.currentOwnerPubkey=? ORDER BY task.createdAt,task.cityId`).all(actor) as SetupRow[],requestsAvailable=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='city_brand_request'").get();
 return rows.flatMap<OrganizerProNextAction>(row=>{const request=requestsAvailable?db.prepare(`SELECT status,expires_at expiresAt,owner_proof ownerProof,brand_proof brandProof FROM city_brand_request WHERE city_id=? AND status IN ('pending','approved','active') ORDER BY rowid DESC LIMIT 1`).get(row.cityId) as RequestRow|undefined:undefined;if(request?.status==="active")return[];if(request?.status==="approved")return[{cityId:row.cityId,cityName:row.cityName,state:"awaiting-publication"}];if(request?.status==="pending"&&request.expiresAt>now&&request.ownerProof&&request.brandProof)return[{cityId:row.cityId,cityName:row.cityName,state:"awaiting-review"}];if(row.state==="payout-confirmed")return[{cityId:row.cityId,cityName:row.cityName,state:"connect-city-signer"}];if(row.state==="signer-confirmed")return[{cityId:row.cityId,cityName:row.cityName,state:"confirm-payout"}];if(row.state==="ready-for-proof")return[{cityId:row.cityId,cityName:row.cityName,state:"submit-activation"}];return[{cityId:row.cityId,cityName:row.cityName,state:"confirm-payout"}];});
}
