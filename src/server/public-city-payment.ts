import {managedProvisionConfigSchema} from "../rustress/contract";
import type {PublicCityPaymentAction} from "../domain/public-city-payment";
import type {PublicCityHost} from "./public-city-host";
import {getPaymentRuntime} from "../payments/runtime";

type PaymentDependencies = {
  entitled: (cityId: string) => boolean;
  activation: (cityId: string) => {phase: string; lnurl: string; activation_config: string} | undefined;
  verifyMigratedIdentity: (slug:string,pubkey:string) => Promise<boolean>;
};

const dependencies = (): PaymentDependencies => {
  const db = getPaymentRuntime().store.db;
  return {
    entitled: cityId => getPaymentRuntime().store.entitled(cityId),
    activation: cityId => db.prepare("SELECT phase,lnurl,activation_config FROM rustress_activation_task WHERE city=?").get(cityId) as
      {phase: string; lnurl: string; activation_config: string} | undefined,
    verifyMigratedIdentity: async (slug,pubkey) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[0-9a-f]{64}$/.test(pubkey)) return false;
      try {
        const [identity,payment]=await Promise.all([
          fetch(`https://bitcoinwalk.org/.well-known/nostr.json?name=${encodeURIComponent(slug)}`,{next:{revalidate:300},signal:AbortSignal.timeout(8_000)}),
          fetch(`https://bitcoinwalk.org/.well-known/lnurlp/${encodeURIComponent(slug)}`,{next:{revalidate:300},signal:AbortSignal.timeout(8_000)}),
        ]);
        if(!identity.ok||!payment.ok)return false;
        const nip=await identity.json() as {names?:Record<string,unknown>},ln=await payment.json() as {tag?:unknown;callback?:unknown};
        const callback=typeof ln.callback==="string"?new URL(ln.callback):null;
        return nip.names?.[slug]===pubkey&&ln.tag==="payRequest"&&callback?.protocol==="https:"&&callback.hostname==="bitcoinwalk.org";
      } catch {return false;}
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
    if (row?.phase === "active" && row.lnurl === "active" && host.state === "brand") {
      const parsed = managedProvisionConfigSchema.safeParse(JSON.parse(row.activation_config));
      if (parsed.success) {
        const config=parsed.data;
        if (config.cityId !== cityId || config.brandPubkey !== host.pubkey || config.invoiceIssuance !== "enabled")
          return {kind: "unavailable"};
        return {kind: "zap", href: `lightning:${config.localPart}@${config.domain}`};
      }
      // Legacy active rows can predate the strict v2 schema; their public brand
      // binding is evaluated by the migration branch below.
    }
    // The public brand binding is super-admin signed and relay-enforced only
    // after Pro entitlement and authority checks. Migrated cities can predate
    // the local activation ledger or retain a stale staging acceptance row.
    if (host.state === "brand") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(citySlug)) return {kind:"unavailable"};
      return {kind:"zap",href:`lightning:${citySlug}@bitcoinwalk.org`};
    }
    // Existing paid cities can predate the activation-task ledger. Their
    // dedicated creator identity is eligible only when the durable paid
    // entitlement and both public managed endpoints independently agree.
    if (host.state === "personal" && source.entitled(cityId) && await source.verifyMigratedIdentity(citySlug,host.pubkey))
      return {kind:"zap",href:`lightning:${citySlug}@bitcoinwalk.org`};
    if (source.entitled(cityId)) return {kind: "unavailable"};
    return {kind: "donate", href: "lightning:donate@bitcoinwalk.org"};
  } catch {
    return {kind: "unavailable"};
  }
}
