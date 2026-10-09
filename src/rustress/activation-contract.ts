import {managedProvisionConfigSchema, provisionConfigSchema, type ProvisionConfig} from "./contract";

const immutableActivationFields = [
  "cityId", "domain", "localPart", "brandPubkey", "authorityEventId",
  "approvalEventId", "brandEventId", "payoutVersion", "payoutDestination",
  "walletRef", "organizerBasisPoints", "retainedBasisPoints",
] as const satisfies readonly (keyof ProvisionConfig)[];

/** Builds the only configuration transition that may expose a reserved city.
 * Authority or payout changes require a new disabled reservation first. */
export function createCityActivation(input: ProvisionConfig): ProvisionConfig {
  const reserved = provisionConfigSchema.parse(input);
  if (reserved.version >= Number.MAX_SAFE_INTEGER) throw new Error("City activation version exhausted.");
  return managedProvisionConfigSchema.parse({...reserved, version: reserved.version + 1, invoiceIssuance: "enabled"});
}

/** Revalidates persisted activation intent before every provider write. */
export function verifyCityActivation(reservedInput: ProvisionConfig, activationInput: ProvisionConfig) {
  const reserved = provisionConfigSchema.parse(reservedInput);
  const activation = managedProvisionConfigSchema.parse(activationInput);
  if (activation.invoiceIssuance !== "enabled" || activation.version !== reserved.version + 1 ||
      immutableActivationFields.some(field => activation[field] !== reserved[field]))
    throw new Error("City activation does not exactly follow its disabled reservation.");
  return activation;
}
