import type {Event} from "nostr-tools";
import {authorizeProSetup} from "../../../nostr/pro-setup-command";
import {paymentBody} from "../../../payments/request-body";
import {prepareProSetupPreview, saveProSetupPayout} from "../../../server/pro-setup";

export const dynamic = "force-dynamic", runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const pending = new Set<string>();
const attempts = new Map<string, number>();
export async function POST(request: Request) {
  if (process.env.BITCOINWALK_PRO_SETUP_PREVIEW !== "true") return reply({error: "Pro account preparation is not enabled yet."}, 503);
  const origin = process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin) return reply({error: "Origin not allowed."}, 403);
  let event: Event, command: ReturnType<typeof authorizeProSetup>;
  try {
    const body = await paymentBody(request) as {event?: Event};
    if (!body.event) throw new Error("Missing signature");
    event = body.event;
    command = authorizeProSetup(event, origin);
  } catch { return reply({error: "Signed owner authorization required."}, 403); }
  const now = Date.now();
  for (const [key, time] of attempts) if (now - time > 60_000) attempts.delete(key);
  const rateKey = `${event.pubkey}:${command.action}`, minimumWait = command.action === "preview" ? 30_000 : 5_000;
  if (pending.size >= 2 || pending.has(rateKey) || attempts.size >= 1000 || now - (attempts.get(rateKey) ?? 0) < minimumWait) {
    return reply({error: `Please wait ${minimumWait / 1000} seconds before retrying this Pro setup action.`}, 429);
  }
  pending.add(rateKey); attempts.set(rateKey, now);
  try {
    if (command.action === "save-payout") return reply({payout: await saveProSetupPayout(command.cityId, event.pubkey, command.destination, event)});
    return reply({preview: await prepareProSetupPreview(command.cityId, event.pubkey, origin)});
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(An approved|Only the current|A settled|City or organizer|Approved city artwork|The approved city photo|Persistent profile|City authority changed|Enter a valid|The Lightning|Lightning endpoint|This destination|Use a personal)/.test(message);
    return reply({error: safe ? message : "Pro setup could not be verified. Retry later; no identity, payment or payout was changed."}, 409);
  } finally {pending.delete(rateKey);}
}
