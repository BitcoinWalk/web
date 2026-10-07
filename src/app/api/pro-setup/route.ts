import type {Event} from "nostr-tools";
import {authorizeProSetup} from "../../../nostr/pro-setup-command";
import {paymentBody} from "../../../payments/request-body";
import {prepareProSetupPreview} from "../../../server/pro-setup";

export const dynamic = "force-dynamic", runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const pending = new Set<string>();
const attempts = new Map<string, number>();
export async function POST(request: Request) {
  if (process.env.BITCOINWALK_PRO_SETUP_PREVIEW !== "true") return reply({error: "Pro account preparation is not enabled yet."}, 503);
  const origin = process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin) return reply({error: "Origin not allowed."}, 403);
  let event: Event, cityId: string;
  try {
    const body = await paymentBody(request) as {event?: Event};
    if (!body.event) throw new Error("Missing signature");
    event = body.event;
    cityId = authorizeProSetup(event, origin).cityId;
  } catch { return reply({error: "Signed owner authorization required."}, 403); }
  const now = Date.now();
  for (const [key, time] of attempts) if (now - time > 60_000) attempts.delete(key);
  if (pending.size >= 2 || pending.has(event.pubkey) || attempts.size >= 1000 || now - (attempts.get(event.pubkey) ?? 0) < 30_000) {
    return reply({error: "Please wait 30 seconds before retrying Pro setup."}, 429);
  }
  pending.add(event.pubkey); attempts.set(event.pubkey, now);
  try {return reply({preview: await prepareProSetupPreview(cityId, event.pubkey, origin)});}
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(An approved|Only the current|A settled|City or organizer|Approved city artwork|The approved city photo|Persistent profile|City authority changed)/.test(message);
    return reply({error: safe ? message : "Pro setup could not be verified. Retry later; no identity, payment or payout was changed."}, 409);
  } finally {pending.delete(event.pubkey);}
}
