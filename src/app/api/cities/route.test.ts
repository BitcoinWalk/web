import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

describe("public city directory endpoint", () => {
  it("returns a cross-origin cacheable versioned directory", async () => {
    vi.doMock("../../../server/public-city-directory", () => ({
      loadPublicCityDirectory: vi.fn().mockResolvedValue({
        version: 1,
        generatedAt: "2026-10-13T00:00:00.000Z",
        cities: [{ id: "city", name: "Madeira", slug: "madeira" }],
      }),
    }));
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(await response.json()).toMatchObject({ version: 1, cities: [{ slug: "madeira" }] });
  });

  it("fails closed instead of returning a partial directory", async () => {
    vi.doMock("../../../server/public-city-directory", () => ({
      loadPublicCityDirectory: vi.fn().mockRejectedValue(new Error("relay unavailable")),
    }));
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
