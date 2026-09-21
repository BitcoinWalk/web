import { SimplePool, verifyEvent, type Event, type Filter } from "nostr-tools";

/** Require a real EOSE from every queried relay, not a timeout mistaken for an empty result. */
export async function readComplete(pool: SimplePool, relays: string[], filter: Filter): Promise<Event[]> {
  return new Promise((resolve, reject) => {
    const events = new Map<string, Event>();
    let settled = false;
    const timer = setTimeout(() => { settled = true; sub.close(); reject(new Error("Relay read timed out.")); }, 10_000);
    const sub = pool.subscribeEose(relays, filter, {
      maxWait: 12_000,
      onevent: event => { if (verifyEvent(event)) events.set(event.id, event); },
      onclose: reasons => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (reasons.length !== relays.length || reasons.some(r => r.reason !== "closed automatically on eose")) reject(new Error("Incomplete relay read."));
        else resolve([...events.values()]);
      },
    });
  });
}

export async function history(pool: SimplePool, relay: string, kind: number, author?: string): Promise<Event[]> {
  const collected = new Map<string, Event>();
  let until: number | undefined;
  for (let page = 0; page < 100; page++) {
    const events = await readComplete(pool, [relay], { kinds: [kind], limit: 200, ...(author ? {authors:[author]} : {}), ...(until === undefined ? {} : {until}) });
    for (const event of events) collected.set(event.id, event);
    if (events.length < 200) return [...collected.values()];
    const oldest = Math.min(...events.map(event => event.created_at));
    if (until !== undefined && oldest >= until) throw new Error("History boundary saturated; scan stopped without advancing.");
    until = oldest;
  }
  throw new Error("History scan limit reached; operator review required.");
}
