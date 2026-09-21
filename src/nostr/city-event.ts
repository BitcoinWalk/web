import { ADMIN_APPROVAL_KIND, CITY_UPDATE_KIND, cityApprovalSchema, type CityApproval, type CityDocument } from "../domain/city";
import type { EventTemplate } from "nostr-tools";
import { CITY_AUTHORIZATION_KIND, cityAuthorizationSchema, type CityAuthorization } from "../domain/city";
import { SUPER_ADMIN_PUBKEY } from "./authority";

export function createAuthorizationEvent(grant: CityAuthorization): EventTemplate {
  const data = cityAuthorizationSchema.parse(grant);
  if (data.superAdminPubkey !== SUPER_ADMIN_PUBKEY) throw new Error("Incorrect super-admin identity");
  return { kind: CITY_AUTHORIZATION_KIND, created_at: Math.floor(Date.now()/1000), content: JSON.stringify(data), tags: [["d", data.cityId], ["client", "bitcoinwalk.org"]] };
}

/** Each signed revision has its own address, retaining all approved snapshots. */
export function createCityUpdateEvent(city: CityDocument, previousRevision?: string): EventTemplate {
  const tags = [
    ["d", `${city.cityId}:${crypto.randomUUID()}`],
    ["i", city.cityId],
    ["city", city.slug],
    ["client", "bitcoinwalk.org"],
  ];
  if (previousRevision) tags.push(["e", previousRevision, "", "previous"]);

  return {
    kind: CITY_UPDATE_KIND,
    content: JSON.stringify(city),
    created_at: Math.floor(Date.now() / 1000),
    tags,
  };
}

export function createApprovalEvent(approval: CityApproval): EventTemplate {
  const validated = cityApprovalSchema.parse(approval);
  return {
    kind: ADMIN_APPROVAL_KIND,
    content: JSON.stringify(validated),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `${validated.cityId}:${crypto.randomUUID()}`],
      ["i", validated.cityId],
      ["e", validated.cityRevisionId, "", "city-revision"],
      ["status", validated.status],
      ["client", "bitcoinwalk.org"],
    ],
  };
}
