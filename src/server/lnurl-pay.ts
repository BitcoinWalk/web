import {bech32} from "@scure/base";
import {lookup} from "node:dns/promises";
import {request as httpsRequest} from "node:https";
import {isIP} from "node:net";

export type ValidatedPayoutDestination = {normalized: string; endpoint: string; callback: string; minSendable: number; maxSendable: number};
function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const p = address.split(".").map(Number), [a, b, c] = p;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && (b === 0 || b === 168) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19) ||
      a === 192 && b === 0 && c === 2 || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113);
  }
  const value = address.toLowerCase();
  return isIP(address) === 6 && !value.startsWith("::") && !value.startsWith("fc") && !value.startsWith("fd") &&
    !/^fe[89ab]/.test(value) && !value.startsWith("ff") && !value.startsWith("2001:db8");
}
async function publicHost(hostname: string) {
  const rows = await lookup(hostname, {all: true, verbatim: true});
  if (!rows.length || rows.some(row => !publicAddress(row.address))) throw new Error("The Lightning endpoint resolves to a private or reserved network.");
  return rows[0].address;
}
function safeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.hash) throw new Error("The Lightning endpoint must use public HTTPS.");
  return url;
}
async function json(url: URL, resolve = publicHost): Promise<unknown> {
  const address = await resolve(url.hostname);
  return new Promise((accept, reject) => {
    const request = httpsRequest({hostname: address, port: 443, path: url.pathname + url.search, method: "GET", servername: url.hostname,
      headers: {Host: url.hostname, Accept: "application/json", "User-Agent": "BitcoinWalk-Payout-Validator/1.0"}, timeout: 7000}, response => {
      if (response.statusCode !== 200) {response.resume(); reject(new Error(`Lightning endpoint returned HTTP ${response.statusCode || 0}.`)); return;}
      const type = String(response.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
      if (type !== "application/json" && type !== "application/lnurlp+json") {response.resume(); reject(new Error("Lightning endpoint did not return JSON.")); return;}
      const declared = Number(response.headers["content-length"] || 0), chunks: Buffer[] = []; let length = 0, settled = false;
      const fail = (error: Error) => {if (settled) return; settled = true; response.destroy(); reject(error);};
      if (declared > 65_536) {fail(new Error("Lightning endpoint response is too large.")); return;}
      response.on("data", chunk => {length += chunk.length; if (length > 65_536) fail(new Error("Lightning endpoint response is too large.")); else chunks.push(chunk);});
      response.on("end", () => {if (settled) return; settled = true; try {accept(JSON.parse(Buffer.concat(chunks).toString("utf8")));} catch {reject(new Error("Lightning endpoint returned invalid JSON."));}});
      response.on("error", fail);
    });
    request.on("timeout", () => request.destroy(new Error("Lightning endpoint timed out.")));
    request.on("error", reject); request.end();
  });
}
export function normalizePayoutDestination(value: string) {
  const input = value.trim();
  if (input.length > 500 || /[\u0000-\u0020\u007f]/.test(input)) throw new Error("Enter a valid Lightning address or LNURL-pay value.");
  if (/^lnurl1/i.test(input)) {
    try {
      const decoded = bech32.decode(input.toLowerCase() as `${string}1${string}`, 5000);
      if (decoded.prefix !== "lnurl") throw new Error();
      const url = new TextDecoder().decode(Uint8Array.from(bech32.fromWords(decoded.words)));
      safeUrl(url);
      return {normalized: input.toLowerCase(), endpoint: url};
    } catch {throw new Error("Enter a valid LNURL-pay value.");}
  }
  const match = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([a-zA-Z0-9.-]{1,253})$/.exec(input);
  if (!match || match[2].startsWith(".") || match[2].endsWith(".") || match[2].includes("..")) throw new Error("Enter a valid Lightning address or LNURL-pay value.");
  const domain = new URL(`https://${match[2]}`).hostname.toLowerCase();
  if (!domain.includes(".") || isIP(domain) || domain.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error("Enter a valid Lightning address domain.");
  return {normalized: `${match[1]}@${domain}`, endpoint: `https://${domain}/.well-known/lnurlp/${encodeURIComponent(match[1])}`};
}
export async function validatePayoutDestination(value: string, options: {blockedDomains?: string[]; fetchJson?: typeof json; resolveHost?: typeof publicHost} = {}): Promise<ValidatedPayoutDestination> {
  const parsed = normalizePayoutDestination(value), endpoint = safeUrl(parsed.endpoint);
  const blocked = new Set(["bitcoinwalk.org", ...(options.blockedDomains ?? [])].map(item => item.toLowerCase()));
  if ([...blocked].some(domain => endpoint.hostname === domain || endpoint.hostname.endsWith(`.${domain}`))) throw new Error("Use a personal destination outside BitcoinWalk to prevent a payment loop.");
  const body = await (options.fetchJson ?? json)(endpoint) as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body) || body.tag !== "payRequest") throw new Error("This destination is not an LNURL-pay endpoint.");
  if (body.status === "ERROR") throw new Error(typeof body.reason === "string" ? `Lightning endpoint rejected the request: ${body.reason.slice(0, 160)}` : "Lightning endpoint rejected the request.");
  const callback = safeUrl(String(body.callback || "")); await (options.resolveHost ?? publicHost)(callback.hostname);
  const min = Number(body.minSendable), max = Number(body.maxSendable);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1000 || max < min || max > 100_000_000_000) throw new Error("Lightning endpoint returned an invalid payment range.");
  if (typeof body.metadata !== "string" || body.metadata.length > 16_384) throw new Error("Lightning endpoint returned invalid payment metadata.");
  try {const metadata = JSON.parse(body.metadata); if (!Array.isArray(metadata)) throw new Error();} catch {throw new Error("Lightning endpoint returned invalid payment metadata.");}
  return {normalized: parsed.normalized, endpoint: endpoint.href, callback: callback.href, minSendable: min, maxSendable: max};
}
