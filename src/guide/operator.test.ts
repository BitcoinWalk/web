import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { wrapAlert } from "./core";
import { exactLiveDeliveryForRetry, exactReplicationDeliveryForRetry } from "./operator";

const bot = generateSecretKey();
const recipient = getPublicKey(generateSecretKey());
const submission = `live:${"a".repeat(64)}`;
const wrapped = JSON.stringify(wrapAlert("Private live alert", recipient, bot).recipient);
const accepted = { submission, recipient, wrapped, state: "acknowledged", purpose: "live" };

describe("Guide exact delivery retry", () => {
  it("returns the exact verified gift wrap without regenerating it", () => {
    const event = exactLiveDeliveryForRetry(accepted, submission, recipient);
    expect(event.id).toBe(JSON.parse(wrapped).id);
    expect(event.kind).toBe(1059);
  });

  it.each([
    [{ ...accepted, state: "pending" }, "acknowledged"],
    [{ ...accepted, purpose: "review" }, "live"],
    [{ ...accepted, recipient: "b".repeat(64) }, "recipient"],
    [{ ...accepted, wrapped: "{}" }, "gift wrap"],
  ])("fails closed for an invalid persisted row", (row, message) => {
    expect(() => exactLiveDeliveryForRetry(row, submission, recipient)).toThrow(message);
  });

  it("requires the exact selected submission", () => {
    expect(() => exactLiveDeliveryForRetry(accepted, `live:${"c".repeat(64)}`, recipient)).toThrow("submission");
  });
});

describe("Guide exact replication delivery retry", () => {
  const cityId = "be8514a4-9df0-4159-a517-71f65761cbbe";
  const replicationSubmission = `replication:${cityId}:1:degraded`;
  const replication = {
    submission: replicationSubmission,
    recipient,
    wrapped,
    state: "acknowledged",
    purpose: "replication-degraded",
  };

  it("returns the exact acknowledged degraded wrapper", () => {
    const event = exactReplicationDeliveryForRetry(replication, replicationSubmission, recipient, "replication-degraded");
    expect(event.id).toBe(JSON.parse(wrapped).id);
  });

  it.each([
    [{ ...replication, purpose: "replication-recovered" }, "purpose"],
    [{ ...replication, state: "pending" }, "acknowledged"],
    [{ ...replication, submission: `replication:${cityId}:1:healthy` }, "submission"],
  ])("fails closed for a mismatched replication row", (row, message) => {
    expect(() => exactReplicationDeliveryForRetry(row, replicationSubmission, recipient, "replication-degraded")).toThrow(message);
  });

  it("does not admit review or live purposes", () => {
    expect(() => exactReplicationDeliveryForRetry(replication, replicationSubmission, recipient, "live")).toThrow("purpose");
  });
});
