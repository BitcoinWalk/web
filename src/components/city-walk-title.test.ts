import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {describe, expect, it} from "vitest";
import CityWalkTitle, {cityWalkTitleLogoVariant} from "./city-walk-title";

describe("city walk title", () => {
  it("uses the city name in the title font instead of the generated city logo", () => {
    const markup = renderToStaticMarkup(createElement(CityWalkTitle, {cityName: "Barcelona", logo: {
      src: "/api/city-logos/job/barcelona-bitcoinwalk-horizontal-on-white.png",
      width: 1823,
      height: 608,
    }}));
    expect(cityWalkTitleLogoVariant).toBe("bitcoinwalk-horizontal-on-white");
    expect(markup).toContain("<h1");
    expect(markup).toContain(">BitcoinWalk Barcelona</h1>");
    expect(markup).not.toContain("barcelona-bitcoinwalk-horizontal-on-white.png");
    expect(markup).not.toContain("published event");
  });

  it("keeps an accessible text title while a verified logo pack is unavailable", () => {
    expect(renderToStaticMarkup(createElement(CityWalkTitle, {cityName: "Barcelona"}))).toContain(">BitcoinWalk Barcelona</h1>");
  });
});
