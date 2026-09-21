"use client";

import { useState } from "react";
import { nip19 } from "nostr-tools";
import type { PublicProfile } from "../nostr/profiles";

export default function EditorIdentity({pubkey,profile}:{pubkey:string;profile?:PublicProfile}) {
  const [failed,setFailed]=useState<string|null>(null);
  const picture=profile?.picture;
  return <div style={{display:"flex",gap:".8rem",alignItems:"center",marginBottom:".5rem"}}>
    {picture && picture!==failed
      // External profile images are intentionally browser-loaded without a server proxy.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={picture} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(picture)} style={{borderRadius:"50%",objectFit:"cover",flexShrink:0}} />
      : <span aria-hidden="true" style={{width:48,height:48,display:"grid",placeItems:"center",borderRadius:"50%",background:"#eee",flexShrink:0}}>👤</span>}
    <div style={{minWidth:0}}><strong dir="auto">{profile?.name ?? "Unnamed Nostr user"}</strong><br/><small style={{overflowWrap:"anywhere"}}>{nip19.npubEncode(pubkey)}</small></div>
  </div>;
}
