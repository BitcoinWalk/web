import { describe, expect, it } from "vitest";
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from "./map-config";

describe("map configuration", () => {
  it("uses the keyless OpenFreeMap vector style instead of OSM volunteer raster tiles", () => {
    const style = new URL(MAP_STYLE_URL);
    expect(style.protocol).toBe("https:");
    expect(style.hostname).toBe("tiles.openfreemap.org");
    expect(MAP_STYLE_URL).not.toContain("tile.openstreetmap.org");
  });

  it("keeps the required data and cartography attribution", () => {
    expect(MAP_ATTRIBUTION).toContain("OpenFreeMap");
    expect(MAP_ATTRIBUTION).toContain("OpenMapTiles");
    expect(MAP_ATTRIBUTION).toContain("OpenStreetMap");
  });
});
