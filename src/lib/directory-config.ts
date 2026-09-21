import type { PaidDirectoryCity } from "../domain/directory";

// Operator-confirmed entitlements only. Neither a sponsor nor an organizer's
// chat URL is proof of payment. No staging pilots are automatically promoted.
export const directoryConfig:{paidCities:Record<string,PaidDirectoryCity>}={paidCities:{}};
