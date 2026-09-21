import { nip19 } from "nostr-tools";
import { SUPER_ADMIN_NPUB } from "../domain/city";

const decoded = nip19.decode(SUPER_ADMIN_NPUB);

if (decoded.type !== "npub" || typeof decoded.data !== "string") {
  throw new Error("BitcoinWalk super-admin identity must be a valid npub.");
}

export const SUPER_ADMIN_PUBKEY = decoded.data;

export function isSuperAdmin(pubkey: string): boolean {
  return pubkey === SUPER_ADMIN_PUBKEY;
}
