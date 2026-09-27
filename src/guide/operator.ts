import { verifyEvent, type Event } from "nostr-tools";

export type PersistedDelivery = {
  submission: string;
  recipient: string;
  wrapped: string;
  state: string;
  purpose: string;
};

function verifiedGiftWrap(row: PersistedDelivery, recipient: string): Event {
  if (!/^[0-9a-f]{64}$/.test(recipient) || row.recipient !== recipient) throw new Error("Delivery recipient does not match.");
  let event: Event;
  try { event = JSON.parse(row.wrapped) as Event; }
  catch { throw new Error("Persisted gift wrap is invalid."); }
  if (event.kind !== 1059 || !verifyEvent(event) || !event.tags.some(tag => tag[0] === "p" && tag[1] === recipient)) {
    throw new Error("Persisted gift wrap is invalid.");
  }
  return event;
}

/** Select one already-acknowledged live notification for an operator-requested
 * idempotent retry. The persisted signed wrapper is returned unchanged. */
export function exactLiveDeliveryForRetry(
  row: PersistedDelivery | undefined,
  submission: string,
  recipient: string,
): Event {
  if (!row || row.submission !== submission || !/^live:[0-9a-f]{64}$/.test(submission)) {
    throw new Error("Exact live submission was not found.");
  }
  if (row.state !== "acknowledged") throw new Error("Only an acknowledged delivery can be retried explicitly.");
  if (row.purpose !== "live") throw new Error("Only a live notification can use this retry operation.");
  return verifiedGiftWrap(row, recipient);
}

/** Select one already-acknowledged replication transition for an exact-event
 * retry. The requested purpose must agree with both the durable row and the
 * transition encoded in its submission key. */
export function exactReplicationDeliveryForRetry(
  row: PersistedDelivery | undefined,
  submission: string,
  recipient: string,
  purpose: string,
): Event {
  if (purpose !== "replication-degraded" && purpose !== "replication-recovered") {
    throw new Error("Replication retry purpose is invalid.");
  }
  const match = /^replication:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([1-9][0-9]*):(degraded|healthy)$/.exec(submission);
  if (!row || row.submission !== submission || !match) throw new Error("Exact replication submission was not found.");
  const expectedState = purpose === "replication-degraded" ? "degraded" : "healthy";
  if (match[3] !== expectedState) throw new Error("Replication submission does not match its purpose.");
  if (row.state !== "acknowledged") throw new Error("Only an acknowledged delivery can be retried explicitly.");
  if (row.purpose !== purpose) throw new Error("Replication delivery purpose does not match.");
  return verifiedGiftWrap(row, recipient);
}
