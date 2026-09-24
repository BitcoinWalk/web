import { describe, expect, it } from "vitest";
import { resolveCityChat } from "../domain/chat";
import { chatConfig } from "./chat-config";
import { austinPilot, austinPilotChat } from "./austin-pilot";

describe("isolated Austin paid-city pilot", () => {
  it("uses the verified Austin channel", () => {
    expect(resolveCityChat(austinPilot.cityId, austinPilot.slug, austinPilotChat)).toEqual({
      scope: "city", environment: "staging",
      url: "https://armada.buzz/s/austin-staging.bitcoinwalk.org/d8006bee1ddd5b5f",
    });
  });
  it("keeps ordinary Austin on global chat", () => {
    expect(resolveCityChat(undefined, "austin", chatConfig).url).toBe("https://armada.buzz/s/chat.bitcoinwalk.org/13bc3a423b4f2954");
    expect(Object.hasOwn(chatConfig.paidCities, austinPilot.cityId)).toBe(false);
  });
  it("does not route other cities into the paid pilot", () => {
    expect(resolveCityChat(austinPilot.cityId, "radom", austinPilotChat).url).toBeNull();
    expect(resolveCityChat("unknown", austinPilot.slug, austinPilotChat).url).toBeNull();
  });
});
