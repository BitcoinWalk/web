import {managedProvisionConfigSchema} from "../rustress/contract";
import type {PublicCityPaymentAction} from "../domain/public-city-payment";
import type {PublicCityHost} from "./public-city-host";
import {getPaymentRuntime} from "../payments/runtime";

type PaymentDependencies = {
  entitled: (cityId: string) => boolean;
  activation: (cityId: string) => {phase: string; lnurl: string; activation_config: string} | undefined;
};

const dependencies = (): PaymentDependencies => {
  const db = getPaymentRuntime().store.db;
  return {
    entitled: cityId => getPaymentRuntime().store.entitled(cityId),
    activation: cityId => db.prepare("SELECT phase,lnurl,activation_config FROM rustress_activation_task WHERE city=?").get(cityId) as
      {phase: string; lnurl: string; activation_config: string} | undefined,
  };
};

/** Public payment presentation is derived from private, independently verified
 * state. A Nostr profile's self-declared lud16 is never payment authority. */
export async function resolvePublicCityPayment(cityId: string, citySlug: string, host: PublicCityHost,
  deps?: PaymentDependencies): Promise<PublicCityPaymentAction> {
  try {
    const source = deps ?? dependencies();
    const row = source.activation(cityId);
    if (row?.phase === "active" && row.lnurl === "active") {
      if (host.state !== "brand") return {kind:"unavailable"};
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
    if (source.entitled(cityId)) return {kind: "unavailable"};
    return {kind: "donate", href: "lightning:donate@bitcoinwalk.org"};
  } catch {
    return {kind: "unavailable"};
  }
}
