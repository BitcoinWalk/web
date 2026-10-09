type Transport = typeof fetch;

export class PublicProvisioningError extends Error {
  constructor(readonly capability: "nip05" | "lnurl", readonly reason: "unavailable" | "invalid") {
    super(`${capability === "nip05" ? "NIP-05" : "LNURL-pay"} endpoint ${reason}.`);
  }
}

type ExpectedCityEndpoint = {
  publicOrigin: string;
  domain: string;
  localPart: string;
  brandPubkey: string;
};

function expected(input: ExpectedCityEndpoint, capability: "nip05" | "lnurl") {
  try {
    const origin = new URL(input.publicOrigin);
    if (origin.protocol !== "https:" || origin.hostname !== input.domain || origin.port || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.localPart) || input.localPart.length > 63 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(input.domain) ||
        !/^[0-9a-f]{64}$/.test(input.brandPubkey)) throw new Error();
    return {...input, origin: origin.origin};
  } catch {throw new PublicProvisioningError(capability, "invalid");}
}

async function json(url: string, capability: "nip05" | "lnurl", transport: Transport, requireCors = false) {
  let response: Response;
  try {
    response = await transport(url, {method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: {Accept: "application/json"}});
  } catch {throw new PublicProvisioningError(capability, "unavailable");}
  if (!response.ok || requireCors && response.headers.get("access-control-allow-origin") !== "*" ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    throw new PublicProvisioningError(capability, response.ok ? "invalid" : "unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PublicProvisioningError(capability, "invalid");
  const decoder = new TextDecoder(); let bytes = 0, text = "";
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length; if (bytes > 65_536) throw new PublicProvisioningError(capability, "invalid");
      text += decoder.decode(part.value, {stream: true});
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PublicProvisioningError) throw error;
    throw new PublicProvisioningError(capability, "invalid");
  } finally {await reader.cancel();}
}

export async function verifyCityNip05(input: ExpectedCityEndpoint, transport: Transport = fetch) {
  const value = expected(input, "nip05");
  const body = await json(`${value.origin}/.well-known/nostr.json?name=${encodeURIComponent(value.localPart)}`, "nip05", transport, true);
  const names = body.names;
  if (!names || typeof names !== "object" || Array.isArray(names) ||
      (names as Record<string, unknown>)[value.localPart] !== value.brandPubkey)
    throw new PublicProvisioningError("nip05", "invalid");
  return {capability: "nip05" as const, state: "verified" as const, identifier: `${value.localPart}@${value.domain}`,
    pubkey: value.brandPubkey};
}

export async function verifyCityLnurl(input: ExpectedCityEndpoint, transport: Transport = fetch) {
  const value = expected(input, "lnurl");
  const body = await json(`${value.origin}/.well-known/lnurlp/${encodeURIComponent(value.localPart)}`, "lnurl", transport);
  let callback: URL, metadata: unknown;
  try {callback = new URL(String(body.callback)); metadata = JSON.parse(String(body.metadata));}
  catch {throw new PublicProvisioningError("lnurl", "invalid");}
  const min = body.minSendable, max = body.maxSendable;
  const metadataValid = Array.isArray(metadata) && metadata.length > 0 && metadata.length <= 20 && metadata.every(row =>
    Array.isArray(row) && row.length === 2 && typeof row[0] === "string" && typeof row[1] === "string" && row[0].length <= 100 && row[1].length <= 10_000) &&
    metadata.some(row => Array.isArray(row) && row[0] === "text/plain");
  if (body.tag !== "payRequest" || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || Number(min) < 1 || Number(max) < Number(min) ||
      !metadataValid || callback.origin !== value.origin || callback.protocol !== "https:" || callback.username || callback.password || callback.hash ||
      "allowsNostr" in body || "nostrPubkey" in body)
    throw new PublicProvisioningError("lnurl", "invalid");
  return {capability: "lnurl" as const, state: "verified" as const, address: `${value.localPart}@${value.domain}`,
    callback: callback.toString(), minSendable: Number(min), maxSendable: Number(max)};
}

export async function verifyCityPublicProvisioning(input: ExpectedCityEndpoint, transport: Transport = fetch) {
  const [nip05, lnurl] = await Promise.all([verifyCityNip05(input, transport), verifyCityLnurl(input, transport)]);
  return {nip05, lnurl};
}
