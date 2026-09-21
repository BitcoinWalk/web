import type { ChatConfig } from "../domain/chat";

// Public routing data, edited by the operator after relay/group provisioning.
// Do not switch to the legacy production chat relay before migration is verified.
export const chatConfig: ChatConfig = {
  environment: "staging",
  global: {
    relay: "wss://chat-staging.bitcoinwalk.org",
    groupId: "b7082b86a614153e",
  },
  paidCities: {},
};
