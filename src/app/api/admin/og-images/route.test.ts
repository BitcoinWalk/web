import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
vi.mock("server-only", () => ({}));
import { mediaRequestTemplate } from "../../../../domain/media-request";
import { POST } from "./route";

describe("super-admin OG image API", () => {
  const call = (body: unknown) =>
    POST(
      new Request("https://app-staging.bitcoinwalk.org/api/admin/og-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  it("rejects unsigned requests", async () => {
    const response = await call({});
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Signed super-admin authorization required.",
    });
  });
  it("rejects a valid request signed by a non-admin identity", async () => {
    const event = finalizeEvent(
        mediaRequestTemplate({ action: "og-studio-list" }),
        generateSecretKey(),
      ),
      response = await call({ event });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Signed super-admin authorization required.",
    });
  });
});
