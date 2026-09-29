import type { PublicProfile } from "../nostr/profiles";
import NostrUser from "./nostr-user";

export default function EditorIdentity({pubkey,profile}:{pubkey:string;profile?:PublicProfile}) {
  return <NostrUser pubkey={pubkey} profile={profile}/>;
}
