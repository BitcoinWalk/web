import {managedProvisionConfigSchema} from "../rustress/contract";
import type {PublicCityPaymentAction} from "../domain/public-city-payment";
import type {PublicCityHost} from "./public-city-host";
import {getPaymentRuntime} from "../payments/runtime";

type PaymentDependencies = {
  entitled: (cityId: string) => boolean;
  activation: (cityId: string) => {phase: string; lnurl: string; activation_config: string} | undefined;
  verifyPublicAddress: (localPart: string) => Promise<string | undefined>;
};

const dependencies = (): PaymentDependencies => {
  const db = getPaymentRuntime().store.db;
  return {
    entitled: cityId => getPaymentRuntime().store.entitled(cityId),
    activation: cityId => db.prepare("SELECT phase,lnurl,activation_config FROM rustress_activation_task WHERE city=?").get(cityId) as
      {phase: string; lnurl: string; activation_config: string} | undefined,
    verifyPublicAddress: async localPart => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(localPart)) return undefined;
      const origin = new URL(process.env.BITCOINWALK_PUBLIC_ORIGIN?.trim() || "https://bitcoinwalk.org");
      if (origin.protocol !== "https:") return undefined;
      const response = await fetch(`${origin.origin}/.well-known/lnurlp/${localPart}`, {next:{revalidate:300},signal:AbortSignal.timeout(8_000)});
      if (!response.ok) return undefined;
      const body = await response.json() as {tag?:unknown;callback?:unknown;minSendable?:unknown;maxSendable?:unknown};
      if (body.tag !== "payRequest" || typeof body.callback !== "string" || typeof body.minSendable !== "number" || typeof body.maxSendable !== "number") return undefined;
      const callback = new URL(body.callback);
      if (callback.protocol !== "https:" || callback.hostname !== origin.hostname || body.minSendable < 1 || body.maxSendable < body.minSendable) return undefined;
      return `${localPart}@${origin.hostname}`;
    },
  };
};

/** Public payment presentation is derived from private, independently verified
 * state. A Nostr profile's self-declared lud16 is never payment authority. */
export async function resolvePublicCityPayment(cityId: string, citySlug: string, host: PublicCityHost,
  deps?: PaymentDependencies): Promise<PublicCityPaymentAction> {
  try {
    const source = deps ?? dependencies();
    const row = source.activation(cityId);
    if (row) {
      if (row.phase !== "active" || row.lnurl !== "active" || host.state !== "brand")
        return {kind: "unavailable"};
      const config = managedProvisionConfigSchema.parse(JSON.parse(row.activation_config));
      if (config.cityId !== cityId || config.brandPubkey !== host.pubkey || config.invoiceIssuance !== "enabled")
        return {kind: "unavailable"};
      // An active v2 configuration is downstream of settled entitlement and
      // fresh authority checks. It remains valid evidence after legacy payment
      // records are migrated or compacted.
      return {kind: "zap", href: `lightning:${config.localPart}@${config.domain}`};
    }
    // Existing Pro cities can predate the local activation ledger. Their
    // super-admin-approved brand binding establishes the tier; independently
    // validate the canonical public endpoint before presenting a recipient.
    if (host.state === "brand") {
      const address = await source.verifyPublicAddress(citySlug);
      return address ? {kind:"zap",href:`lightning:${address}`} : {kind:"unavailable"};
    }
    if (source.entitled(cityId)) return {kind: "unavailable"};
    return {kind: "donate", href: "lightning:donate@bitcoinwalk.org"};
  } catch {
    return {kind: "unavailable"};
  }
}
