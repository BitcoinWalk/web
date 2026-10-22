import {compareEvents, nip19} from "nostr-tools";
import {cityOwnerPubkey} from "../domain/city";
import type {CalendarWalk} from "../nostr/calendar-records";
import type {AuthorizationRecord} from "../nostr/city-records";

/** Resolve the current city owner, including ownership transfers, to the
 * interoperable NIP-19 identifier exposed by public feeds. Older cities that
 * predate authorization records retain their organizer-signed city revision
 * as the public source of truth. */
export function publicOrganizerNpubs(
  walks: CalendarWalk[],
  authorizations: AuthorizationRecord[],
): Map<string, string> {
  const current = new Map<string, AuthorizationRecord>();
  for (const record of [...authorizations].sort((a, b) => compareEvents(a.event, b.event))) {
    if (!current.has(record.grant.cityId)) current.set(record.grant.cityId, record);
  }
  const result = new Map<string, string>();
  for (const walk of walks) {
    const pubkey = current.has(walk.revision.city.cityId)
      ? cityOwnerPubkey(current.get(walk.revision.city.cityId)!.grant)
      : walk.revision.event.pubkey;
    if (/^[0-9a-f]{64}$/.test(pubkey)) result.set(walk.revision.city.cityId, nip19.npubEncode(pubkey));
  }
  return result;
}
