export type PublicCityPaymentAction =
  | {kind: "donate"; href: "lightning:donate@bitcoinwalk.org"}
  | {kind: "zap"; href: string}
  | {kind: "unavailable"};
