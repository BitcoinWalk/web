import type { ChatConfig } from "../domain/chat";

// Synthetic fixture only: never published as an approved city or proof of payment.
export const austinPilot = {
  cityId: "8a87b684-e323-4f34-a9ac-6ec1575235c5",
  slug: "austin-staging",
};

// Only the isolated pilot page imports this configuration.
export const austinPilotChat: ChatConfig = {
  environment: "staging",
  global: null,
  paidCities: {
    [austinPilot.cityId]: {
      slug: austinPilot.slug,
      destination: {
        relay: "wss://austin-staging.bitcoinwalk.org",
        groupId: "d8006bee1ddd5b5f",
      },
    },
  },
};
