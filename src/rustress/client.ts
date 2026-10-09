import {activationReceiptSchema, capabilitiesSchema, managedProvisionConfigSchema, provisionConfigSchema, provisionDigest, provisionReceiptSchema,
  RUSTRESS_API, type ActivationReceipt, type ProvisionConfig, type ProvisionReceipt} from "./contract";

type Transport = typeof fetch;
type Options = {origin: string; token: string; domain: string; adapterRevision: string};
export class ProvisioningError extends Error {
  constructor(readonly outcome: "rejected" | "unknown" | "unavailable") {
    super(outcome === "unknown" ? "Provisioning outcome is unknown. Read status before retrying the exact configuration."
      : outcome === "rejected" ? "Provisioning request rejected. Review configuration and authority."
        : "Provisioning service unavailable or incompatible.");
  }
}

/** Isolated client for the NEW companion API, not Rustress's dashboard API.
 * Loopback only: remote providers need an audited tunnel, not relaxed TLS/SSRF
 * rules. Never import from client components or instantiate in checkout runtime. */
type Mode = "disabled" | "enabled";
type ReceiptFor<M extends Mode> = M extends "disabled" ? ProvisionReceipt : ActivationReceipt;

class ProviderClient<M extends Mode> {
  readonly #origin: string;
  readonly #token: string;
  readonly #domain: string;
  readonly #adapterRevision: string;
  readonly #transport: Transport;
  constructor(options: Options, private readonly mode: M, transport: Transport = fetch) {
    try {
      const url = new URL(options.origin);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password ||
          url.pathname !== "/" || url.search || url.hash || !/^[A-Za-z0-9_-]{43,256}$/.test(options.token) ||
          !/^[0-9a-f]{64}$/.test(options.adapterRevision) || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(options.domain)) throw new Error();
      this.#origin = url.origin; this.#token = options.token; this.#domain = options.domain;
      this.#adapterRevision = options.adapterRevision; this.#transport = transport;
    } catch {throw new ProvisioningError("unavailable");}
  }
  async #request(path: string, body?: unknown): Promise<unknown> {
    const mutation = body !== undefined;
    try {
      const response = await this.#transport(this.#origin + path, {
        method: mutation ? "POST" : "GET", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(5000),
        headers: {Authorization: `Bearer ${this.#token}`, Accept: "application/json", "Content-Type": "application/json"},
        ...(mutation ? {body: JSON.stringify(body)} : {}),
      });
      // Error bodies may contain provider credentials. Never parse or expose them.
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProvisioningError(mutation && ![400,401,403,409,422].includes(response.status) ? "unknown" : "rejected");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let text = "", bytes = 0;
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.length;
          if (bytes > 16_384) throw new Error();
          text += decoder.decode(part.value, {stream: true});
        }
        text += decoder.decode();
      } finally {await reader.cancel();}
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof ProvisioningError) throw error;
      // A connection error after POST is not proof that nothing was applied.
      throw new ProvisioningError(mutation ? "unknown" : "unavailable");
    }
  }
  async capabilities() {
    try {
      const result = capabilitiesSchema.parse(await this.#request("/v1/bitcoinwalk/capabilities"));
      if (result.domain !== this.#domain || result.adapterRevision !== this.#adapterRevision) throw new Error();
      return result;
    } catch {throw new ProvisioningError("unavailable");}
  }
  #config(input: ProvisionConfig) {
    try {
      const config = this.mode === "disabled" ? provisionConfigSchema.parse(input) : managedProvisionConfigSchema.parse(input);
      if (config.invoiceIssuance !== this.mode || this.mode === "enabled" && config.version < 2) throw new Error();
      if (config.domain !== this.#domain) throw new Error();
      return config;
    } catch {throw new ProvisioningError("rejected");}
  }
  #receipt(value: unknown, config: ProvisionConfig): ReceiptFor<M> {
    const result = (this.mode === "disabled" ? provisionReceiptSchema : activationReceiptSchema).parse(value) as ReceiptFor<M>;
    if (result.cityId !== config.cityId || result.version !== config.version || result.configHash !== provisionDigest(config)) throw new Error();
    return result;
  }
  async status(input: ProvisionConfig): Promise<ReceiptFor<M>> {
    const config = this.#config(input);
    await this.capabilities();
    try {return this.#receipt(await this.#request(`/v1/bitcoinwalk/cities/${config.cityId}`), config);}
    catch {throw new ProvisioningError("unavailable");}
  }
  async #write(action: "prepare" | "apply", input: ProvisionConfig): Promise<ReceiptFor<M>> {
    const config = this.#config(input);
    await this.capabilities();
    const hash = provisionDigest(config);
    const result = await this.#request(`/v1/bitcoinwalk/cities/${config.cityId}/${action}`, {
      api: RUSTRESS_API, expectedVersion: config.version - 1,
      idempotencyKey: `${config.cityId}:${config.version}:${hash}`, config,
    });
    try {
      const receipt = this.#receipt(result, config);
      // An exact prepare retry after apply may return the advanced state, never
      // downgrade it. Apply still requires the fully applied configuration.
      if (action === "apply" && receipt.state !== "applied") throw new Error();
      // A successful response alone is not activation: independently read back.
      const readBack = await this.status(config);
      if (readBack.state !== receipt.state) throw new Error();
      return readBack;
    } catch {throw new ProvisioningError("unknown");}
  }
  prepare(input: ProvisionConfig) {return this.#write("prepare", input);}
  apply(input: ProvisionConfig) {return this.#write("apply", input);}
}

/** Disabled-only reservation client. It cannot construct or accept activation. */
export class RustressProvisioner {
  readonly #client: ProviderClient<"disabled">;
  constructor(options: Options, transport: Transport = fetch) {this.#client = new ProviderClient(options, "disabled", transport);}
  capabilities() {return this.#client.capabilities();}
  status(input: ProvisionConfig) {return this.#client.status(input);}
  prepare(input: ProvisionConfig) {return this.#client.prepare(input);}
  apply(input: ProvisionConfig) {return this.#client.apply(input);}
}

/** Explicit managed activation client. Callers must separately prove the exact
 * disabled predecessor and revalidate authority before every write. */
export class RustressActivator {
  readonly #client: ProviderClient<"enabled">;
  constructor(options: Options, transport: Transport = fetch) {this.#client = new ProviderClient(options, "enabled", transport);}
  capabilities() {return this.#client.capabilities();}
  status(input: ProvisionConfig) {return this.#client.status(input);}
  prepare(input: ProvisionConfig) {return this.#client.prepare(input);}
  apply(input: ProvisionConfig) {return this.#client.apply(input);}
}
