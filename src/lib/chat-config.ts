import type { ChatConfig } from "../domain/chat";

// Public routing data, edited by the operator after relay/group provisioning.
// Production global community verified on 23 September 2026.
export const chatConfig: ChatConfig = {
  environment: "production",
  global: {
    relay: "wss://chat.bitcoinwalk.org",
    groupId: "13bc3a423b4f2954",
  },
  paidCities: {},
};
