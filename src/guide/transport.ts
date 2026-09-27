import { SimplePool, verifyEvent, type Event, type EventTemplate, type Filter, type VerifiedEvent } from "nostr-tools";

function failureCategory(reasons:unknown[]):"authentication"|"rate-limit"|"policy"|"timeout"|"connection"|"unknown"{
 const text=reasons.map(reason=>reason instanceof Error?reason.message:String(reason)).join(" ").toLowerCase();
 if(text.includes("auth-required")||text.includes("auth timed out"))return "authentication";
 if(text.includes("rate-limit")||text.includes("rate limit"))return "rate-limit";
 if(text.includes("blocked")||text.includes("restricted")||text.includes("denied")||text.includes("pow:"))return "policy";
 if(text.includes("timed out")||text.includes("timeout"))return "timeout";
 if(text.includes("connection"))return "connection";
 return "unknown";
}

export async function publishIdempotent(pool:SimplePool,relays:string[],event:Event,onauth:(template:EventTemplate)=>Promise<VerifiedEvent>):Promise<"acknowledged"|"duplicate">{
 const results=await Promise.allSettled(pool.publish(relays,event,{maxWait:10_000,onauth}));
 if(results.some(result=>result.status==="fulfilled"))return "acknowledged";
 const reasons=results.flatMap(result=>result.status==="rejected"?[result.reason]:[]);
 if(reasons.some(reason=>(reason instanceof Error?reason.message:String(reason)).toLowerCase().startsWith("duplicate:")))return "duplicate";
 throw new Error(`publication failed: ${failureCategory(reasons)}`);
}

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

/** Inbox preferences are signed by the recipient and their destinations remain
 * operator-allowlisted. One unavailable discovery relay must not block delivery. */
export async function readAnyComplete(pool:SimplePool,relays:string[],filter:Filter):Promise<Event[]>{
 const results=await Promise.allSettled(relays.map(relay=>readComplete(pool,[relay],filter)));
 const completed=results.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
 if(!completed.length)throw new Error("No discovery relay completed the signed inbox read.");
 const events=new Map<string,Event>();for(const rows of completed)for(const event of rows)events.set(event.id,event);
 return [...events.values()];
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
