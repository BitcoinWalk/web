import { nip19, compareEvents, type Event, type EventTemplate } from "nostr-tools";
import { cityAuthorizationSchema } from "../domain/city";
import { isSuperAdmin } from "./authority";
import { createAuthorizationEvent } from "./city-event";
import type { AuthorizationRecord } from "./city-records";

export function editorPublicKey(input: string): string {
  const value=input.trim();
  if(!value.startsWith("npub1")) throw new Error("Enter a public npub identity, never a private key.");
  try {
    const decoded=nip19.decode(value);
    if(decoded.type==="npub") return decoded.data;
  } catch { /* Do not echo potentially private input. */ }
  throw new Error("That npub is not valid. Check the full public identity.");
}

export function latestCityGrants(records: AuthorizationRecord[]): AuthorizationRecord[] {
  const cities=new Map<string,AuthorizationRecord>();
  for(const record of [...records].sort((a,b)=>compareEvents(a.event,b.event))) if(!cities.has(record.grant.cityId)) cities.set(record.grant.cityId,record);
  return [...cities.values()];
}

export function editorChange(record: AuthorizationRecord, actor: string, action: "add"|"remove", pubkey: string, now = Math.floor(Date.now()/1000)): EventTemplate {
  if(!isSuperAdmin(actor)) throw new Error("Only the BitcoinWalk super-admin can manage editors.");
  if(!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error("Invalid editor public key.");
  const grant=cityAuthorizationSchema.parse(record.grant);
  if(isSuperAdmin(pubkey)) throw new Error("The super-admin already has access to every city; that access cannot be removed here.");
  if(action==="remove" && pubkey===grant.creatorPubkey) throw new Error("The creator must remain an editor.");
  const existing=grant.editorPubkeys.includes(pubkey);
  if(action==="add" && existing) throw new Error("This identity is already an editor.");
  if(action==="remove" && !existing) throw new Error("This identity is not on this city's editor list.");
  if(now<=record.event.created_at) throw new Error("Wait until the next second, then try again; permission updates must have a newer timestamp.");
  const editorPubkeys=action==="add" ? [...new Set([...grant.editorPubkeys,pubkey])] : grant.editorPubkeys.filter(key=>key!==pubkey);
  const template=createAuthorizationEvent({...grant,editorPubkeys});
  return {...template,created_at:now};
}

export function assertGrantUnchanged(expected: AuthorizationRecord, current: AuthorizationRecord|null): void {
  if(!current || current.grant.cityId!==expected.grant.cityId || current.event.id!==expected.event.id) throw new Error("The editor list changed or could not be read. Reload before making changes.");
}

export function assertPermissionSignature(signed: Event, template: EventTemplate, actor: string): void {
  if(signed.pubkey!==actor || signed.kind!==template.kind || signed.created_at!==template.created_at || signed.content!==template.content || JSON.stringify(signed.tags)!==JSON.stringify(template.tags)) throw new Error("The signer returned a different account or permission change. Nothing was published.");
}
