import type { CityDocument } from "../domain/city";
import type { LocatedOccurrence } from "../domain/event-location";
import type { CalendarWalk } from "./calendar-records";
import { CALENDAR_EVENT_KIND } from "../domain/city";

export type UnsignedNostrEvent = {
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
};

/**
 * Produces the interoperable NIP-52 payload for one dated walk on any weekday.
 * Signing and publication are deliberately separate: user nsecs never reach this app.
 */
export function createCalendarEvent(
  city: CityDocument,
  occurrence: { id: string; startUnixSeconds: number; endUnixSeconds?: number; geohash?: string },
): UnsignedNostrEvent {
  const tags = [
    ["d", occurrence.id],
    ["title", `BitcoinWalk ${city.cityName}`],
    ["summary", `BitcoinWalk in ${city.cityName}`],
    ["image", city.heroImageUrl],
    ["start", String(occurrence.startUnixSeconds)],
    ["D", String(Math.floor(occurrence.startUnixSeconds / 86_400))],
    ["location", city.meetingPoint.description],
    ["location", `${city.meetingPoint.latitude},${city.meetingPoint.longitude}`],
    ["t", "bitcoinwalk"],
  ];

  if (city.chatUrl) tags.push(["r", city.chatUrl]);

  if (occurrence.endUnixSeconds) tags.push(["end", String(occurrence.endUnixSeconds)]);
  if (occurrence.geohash) tags.push(["g", occurrence.geohash]);

  return {
    kind: CALENDAR_EVENT_KIND,
    content: city.description,
    created_at: Math.floor(Date.now() / 1000),
    tags,
  };
}

/** The organizer signs this before the city exists. It is stored but hidden by
 * the managed relay until an admin approval binds the exact event and revision. */
export function createInitialCalendarProposal(city: CityDocument, timeZone: string): UnsignedNostrEvent {
  const start = Math.floor(new Date(city.startAt).getTime() / 1000);
  if (!Number.isSafeInteger(start) || start <= 0) throw new Error("Choose a valid first-walk date and time.");
  if (!timeZone || timeZone.length > 100) throw new Error("Your device did not provide a valid local timezone.");
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start * 1000));
  const event = createCalendarEvent(city, { id: `${city.cityId}:${localDate}`, startUnixSeconds: start, endUnixSeconds: start + 3600 });
  event.tags.push(
    ["start_tzid", timeZone],
    ["end_tzid", timeZone],
    ["i", city.cityId],
    ["bitcoinwalk", "initial-proposal-v1"],
  );
  return event;
}

/** A city currently stores one scheduled occurrence. Keep its calendar address
 * stable across edits/rescheduling; a future multi-occurrence UI must allocate
 * distinct occurrence IDs rather than reuse this current-walk slot forever.
 */
export function createApprovedCalendarEvent(city: CityDocument, revisionId: string, approvalId: string): UnsignedNostrEvent {
  if(!/^[0-9a-f]{64}$/.test(revisionId)||!/^[0-9a-f]{64}$/.test(approvalId)) throw new Error("Exact revision and approval event IDs are required.");
  const start=Math.floor(new Date(city.startAt).getTime()/1000);
  if(!Number.isSafeInteger(start)||start<0) throw new Error("Invalid approved start time.");
  const event=createCalendarEvent(city,{id:city.cityId,startUnixSeconds:start});
  event.tags.push(["i",city.cityId],["e",revisionId,"","city-revision"],["e",approvalId,"","city-approval"]);
  return event;
}

/** One organizer-owned, independently shareable occurrence. Its address is
 * stable across edits, while the signature always belongs to the organizer. */
export function createOrganizerCalendarEvent(walk: CalendarWalk, occurrence: LocatedOccurrence): UnsignedNostrEvent {
  const revisionId = walk.revision.event.id;
  const approvalId = walk.approval.event.id;
  if (!/^[0-9a-f]{64}$/.test(revisionId) || !/^[0-9a-f]{64}$/.test(approvalId)) throw new Error("Exact revision and approval event IDs are required.");
  if (!/^[0-9a-f-]{36}:20\d{2}-\d{2}-\d{2}$/.test(occurrence.id)) throw new Error("The occurrence needs a stable series/date identifier.");
  const city = { ...walk.revision.city, meetingPoint: occurrence.meetingPoint };
  const event = createCalendarEvent(city, { id: occurrence.id, startUnixSeconds: occurrence.start, endUnixSeconds: occurrence.end });
  event.tags.push(
    ["start_tzid", occurrence.timeZone],
    ["end_tzid", occurrence.timeZone],
    ["i", city.cityId],
    ["bitcoinwalk", "occurrence-v1"],
    ["e", revisionId, "", "city-revision"],
    ["e", approvalId, "", "city-approval"],
  );
  return event;
}
