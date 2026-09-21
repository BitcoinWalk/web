import { SimplePool, verifyEvent, type Event, type EventTemplate, type VerifiedEvent } from "nostr-tools";

export type RelayPublication = {
  accepted: string[];
  rejected: Array<{ relay: string; reason: string }>;
};

type RelayAuthentication = (template: EventTemplate) => Promise<VerifiedEvent>;

/**
 * Publishes only a verified signature and reports per-relay outcomes. The caller decides whether
 * the required acknowledgement threshold has been met.
 */
export async function publishVerifiedEvent(
  event: Event,
  relays: string[],
  minimumAcknowledgements = 1,
  onAuthentication?: RelayAuthentication,
): Promise<RelayPublication> {
  if (!verifyEvent(event)) throw new Error("Refusing to publish an event with an invalid signature.");
  if (new Set(relays).size !== relays.length) throw new Error("Relay URLs must be unique.");
  if (minimumAcknowledgements < 1 || minimumAcknowledgements > relays.length) {
    throw new Error("Acknowledgement threshold must be between one and the number of relays.");
  }

  const pool = new SimplePool();
  try {
    const outcomes = await Promise.allSettled(pool.publish(relays, event, { maxWait: 8_000, onauth: onAuthentication }));
    const accepted: string[] = [];
    const rejected: RelayPublication["rejected"] = [];

    outcomes.forEach((outcome, index) => {
      const relay = relays[index];
      if (outcome.status === "fulfilled") accepted.push(relay);
      else rejected.push({ relay, reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) });
    });

    if (accepted.length < minimumAcknowledgements) {
      const reasons = rejected.map(({ relay, reason }) => `${relay}: ${reason}`).join("; ");
      throw new Error(`Published to ${accepted.length}/${relays.length} relays; ${minimumAcknowledgements} required. ${reasons}`);
    }

    return { accepted, rejected };
  } finally {
    pool.close(relays);
    pool.destroy();
  }
}
