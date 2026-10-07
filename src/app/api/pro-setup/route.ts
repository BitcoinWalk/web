import type {Event} from "nostr-tools";
import {authorizeProSetup} from "../../../nostr/pro-setup-command";
import {paymentBody} from "../../../payments/request-body";
import {approveBrandRequest, cancelBrandRequest, clearProSetupSigner, confirmBrandPublication, listBrandRequests, prepareBrandPublication, prepareBrandRequest, prepareProSetupPreview,
  reviewBrandRequest, saveProSetupPayout, saveProSetupSigner, submitBrandProofs} from "../../../server/pro-setup";

export const dynamic = "force-dynamic", runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const pending = new Set<string>();
const attempts = new Map<string, number>();
export async function POST(request: Request) {
  if (process.env.BITCOINWALK_PRO_SETUP_PREVIEW !== "true") return reply({error: "Pro account preparation is not enabled yet."}, 503);
  const origin = process.env.BITCOINWALK_PAYMENT_APP_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin) return reply({error: "Origin not allowed."}, 403);
  let event: Event, brandProof: Event | undefined, ownerProof: Event | undefined, approvalEvent: Event | undefined, command: ReturnType<typeof authorizeProSetup>;
  try {
    const body = await paymentBody(request) as {event?: Event; brandProof?: Event; ownerProof?: Event; approvalEvent?: Event};
    if (!body.event) throw new Error("Missing signature");
    event = body.event; brandProof = body.brandProof; ownerProof = body.ownerProof; approvalEvent = body.approvalEvent;
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
    if (command.action === "confirm-city-signer") {
      if (!brandProof) throw new Error("Separate city signer proof is required.");
      return reply({signer: await saveProSetupSigner(command.cityId, event.pubkey, command, brandProof, origin)});
    }
    if (command.action === "clear-city-signer") return reply({signer: await clearProSetupSigner(command.cityId, event.pubkey)});
    if (command.action === "prepare-brand-request") return reply({request: await prepareBrandRequest(command.cityId, event.pubkey, origin)});
    if (command.action === "submit-brand-proofs") {
      if (!ownerProof || !brandProof) throw new Error("Both organizer and city signer proofs are required.");
      return reply({request: await submitBrandProofs(command.cityId, command.requestId, event.pubkey, ownerProof, brandProof)});
    }
    if (command.action === "cancel-brand-request") return reply({request: await cancelBrandRequest(command.cityId, command.requestId, event.pubkey)});
    if (command.action === "list-brand-requests") return reply({requests: await listBrandRequests(event.pubkey)});
    if (command.action === "review-brand-request") return reply({template: await reviewBrandRequest(command.requestId, event.pubkey)});
    if (command.action === "approve-brand-request") {
      if (!approvalEvent) throw new Error("Exact super-admin city binding signature is required.");
      return reply({request: await approveBrandRequest(command.requestId, event.pubkey, approvalEvent)});
    }
    if (command.action === "prepare-brand-publication") return reply({request: await prepareBrandPublication(command.requestId, event.pubkey)});
    if (command.action === "confirm-brand-publication") return reply({request: await confirmBrandPublication(command.requestId, event.pubkey)});
    return reply({preview: await prepareProSetupPreview(command.cityId, event.pubkey, origin)});
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(An approved|Only the current|A settled|The settled Pro payment|Pro setup|City or organizer|Approved city artwork|The approved city photo|Persistent profile|City authority changed|City ownership, approval or entitlement changed|City signer, payout|City identity|Active city identity|No city identity|No relay|Exact city identity|Separate city signer|The separate city signer|Use a separate|Clear the saved|Complete payout|A different city account|Both organizer|Super-admin review|Super-admin publication|Exact super-admin|Enter a valid|The Lightning|Lightning endpoint|This destination|Use a personal)/.test(message);
    return reply({error: safe ? message : "Pro setup could not be verified. Retry later; no identity, payment or payout was changed."}, 409);
  } finally {pending.delete(rateKey);}
}
