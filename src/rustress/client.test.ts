import {describe, expect, it, vi} from "vitest";
import {RustressProvisioner} from "./client";
import {provisionConfigSchema, provisionDigest, RUSTRESS_API, RUSTRESS_REVIEWED_COMMIT, type ProvisionConfig} from "./contract";

const token = "test-only-not-a-wallet-secret-".padEnd(48, "x"), revision = "f".repeat(64);
const options = {origin: "http://127.0.0.1:8889", token, domain: "bitcoinwalk.org", adapterRevision: revision};
const config: ProvisionConfig = {cityId: "00000000-0000-4000-8000-000000000001", version: 1,
  domain: "bitcoinwalk.org", localPart: "fixture-city", brandPubkey: "a".repeat(64),
  authorityEventId: "b".repeat(64), approvalEventId: "c".repeat(64), brandEventId: "d".repeat(64),
  payoutVersion: 1, payoutDestination: "fixture@example.org", walletRef: "isolated-test",
  organizerBasisPoints: 7900, retainedBasisPoints: 2100, invoiceIssuance: "disabled"};
const capability = {api: RUSTRESS_API, upstreamCommit: RUSTRESS_REVIEWED_COMMIT,
  adapterRevision: revision, domain: "bitcoinwalk.org", atomicConfiguration: true,
  managedEntriesOnly: true, compareAndSwap: true, idempotency: true, invoiceIssuanceGate: true};
const receipt = (state = "prepared") => ({api: RUSTRESS_API, cityId: config.cityId, version: 1,
  configHash: provisionDigest(config), state, invoiceIssuance: "disabled"});
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(state = "prepared") {
  const transport = vi.fn<typeof fetch>(async url => json(String(url).endsWith("capabilities") ? capability : receipt(state)));
  return {client: new RustressProvisioner(options, transport), transport};
}
describe("isolated Rustress provisioning adapter", () => {
  it("pins capabilities and independently reads back a prepared configuration", async () => {
    const {client, transport} = fixture();
    expect(await client.prepare(config)).toEqual(receipt());
    expect(transport).toHaveBeenCalledTimes(4);
    const request = transport.mock.calls[1][1]!;
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(request.headers).toMatchObject({Authorization: `Bearer ${token}`});
    expect(JSON.parse(request.body as string)).toMatchObject({config, expectedVersion: 0});
    expect(request.body).not.toContain(token);
  });
  it("applies only disabled configuration, never a payment or public activation", async () => {
    const {client, transport} = fixture("applied");
    expect(await client.apply(config)).toEqual(receipt("applied"));
    expect(String(transport.mock.calls[1][0]).endsWith("/apply")).toBe(true);
    expect(transport.mock.calls.every(([url]) => !String(url).includes("/admin"))).toBe(true);
  });
  it("reuses exact idempotency keys and payloads on a caller-directed retry", async () => {
    const {client, transport} = fixture();
    await client.prepare(config); await client.prepare(config);
    const writes = transport.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(2); expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  });
  it("refuses unpinned providers and wrong-domain capabilities before writes", async () => {
    for (const broken of [{upstreamCommit: "unreviewed"}, {adapterRevision: "e".repeat(64)}, {domain: "other.org"},
      {atomicConfiguration: false}, {managedEntriesOnly: false}, {invoiceIssuanceGate: false}]) {
      const transport = vi.fn<typeof fetch>(async () => json({...capability, ...broken}));
      await expect(new RustressProvisioner(options, transport).prepare(config)).rejects.toMatchObject({outcome: "unavailable"});
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects unsafe origins and credential-bearing URLs without making requests", () => {
    for (const origin of ["http://213.232.235.240:8889", "https://example.org", "http://localhost:8889", "http://127.0.0.1:8889/admin",
      "http://secret@127.0.0.1:8889", "http://127.0.0.1:8889/?secret=x"]) {
      expect(() => new RustressProvisioner({...options, origin})).toThrow("unavailable");
    }
  });
  it("rejects circular payouts, altered splits, extra secrets and enabled invoices before networking", async () => {
    for (const changes of [{payoutDestination: "fixture-city@bitcoinwalk.org"}, {organizerBasisPoints: 7800},
      {invoiceIssuance: "enabled"}, {nwc: "nostr+walletconnect://secret"}, {domain: "other.org"}, {version: 0},
      {localPart: "../admin"}, {brandPubkey: "nsec1secret"}]) {
      const {client, transport} = fixture();
      await expect(client.prepare({...config, ...changes} as ProvisionConfig)).rejects.toMatchObject({outcome: "rejected"});
      expect(transport).not.toHaveBeenCalled();
    }
  });
  it("does not expose provider error bodies or network secrets", async () => {
    const transport = vi.fn<typeof fetch>(async url => String(url).endsWith("capabilities") ? json(capability)
      : new Response("NWC_SECRET_DO_NOT_EXPOSE", {status: 500}));
    await expect(new RustressProvisioner(options, transport).apply(config)).rejects.toMatchObject({outcome: "unknown"});
    try {await new RustressProvisioner(options, async () => {throw new Error(token);}).capabilities();}
    catch (error) {expect(String(error)).not.toContain(token);}
  });
  it("treats a lost POST response as unknown and never automatically resends", async () => {
    const transport = vi.fn<typeof fetch>(async url => {
      if (String(url).endsWith("capabilities")) return json(capability);
      throw new Error("timeout");
    });
    await expect(new RustressProvisioner(options, transport).apply(config)).rejects.toMatchObject({outcome: "unknown"});
    expect(transport.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("requires exact state, city, version, digest and disabled read-back", async () => {
    for (const changes of [{cityId: "00000000-0000-4000-8000-000000000002"}, {version: 2}, {configHash: "0".repeat(64)},
      {state: "applied"}, {invoiceIssuance: "enabled"}, {nwc: "secret"}]) {
      const transport = vi.fn<typeof fetch>(async (url, init) => json(String(url).endsWith("capabilities") ? capability
        : init?.method === "POST" ? receipt() : {...receipt(), ...changes}));
      await expect(new RustressProvisioner(options, transport).prepare(config)).rejects.toMatchObject({outcome: "unknown"});
    }
  });
  it("rejects oversized and malformed responses", async () => {
    for (const body of ["x".repeat(20_000), "{invalid-json"]) {
      await expect(new RustressProvisioner(options, async () => new Response(body)).capabilities()).rejects.toMatchObject({outcome: "unavailable"});
    }
  });
  it("classifies a conflict as rejection without leaking response details", async () => {
    const transport = vi.fn<typeof fetch>(async url => String(url).endsWith("capabilities") ? json(capability) : new Response(token, {status: 409}));
    await expect(new RustressProvisioner(options, transport).prepare(config)).rejects.toMatchObject({outcome: "rejected"});
  });
  it("keeps secret options out of ordinary object serialization", () => {
    const {client} = fixture(); expect(JSON.stringify(client)).not.toContain(token);
  });
  it("hashes schema-canonical field order and binds destination/evidence versions", () => {
    const reordered = Object.fromEntries(Object.entries(config).reverse()) as ProvisionConfig;
    expect(provisionDigest(reordered)).toBe(provisionDigest(config));
    expect(provisionDigest({...config, payoutVersion: 2})).not.toBe(provisionDigest(config));
    expect(provisionConfigSchema.safeParse({...config, payoutDestination: "https://private.invalid"}).success).toBe(false);
  });
});
