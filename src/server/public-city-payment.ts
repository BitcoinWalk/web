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
export function resolvePublicCityPayment(cityId: string, host: PublicCityHost,
  deps?: PaymentDependencies): PublicCityPaymentAction {
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
    if (source.entitled(cityId)) return {kind: "unavailable"};
    return {kind: "donate", href: "lightning:donate@bitcoinwalk.org"};
  } catch {
    return {kind: "unavailable"};
  }
}
