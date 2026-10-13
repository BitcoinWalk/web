"use client";

import OrganizerIdentity from "../../components/organizer-identity";

export default function PostcardLogin(){
 return <OrganizerIdentity
  allowAccountCreation={false}
  disabled={false}
  heading="Connect your BitcoinWalk Host"
  intro="Connect the existing Nostr identity you use to manage your BitcoinWalk."
  onIdentityChange={()=>{}}
 />;
}
