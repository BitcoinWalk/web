"use client";

import Image from "next/image";
import {useEffect,useState} from "react";
import SignerAppLink from "./signer-app-link";

export default function SignerPlatformHelp(){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=matchMedia("(max-width:1100px)");const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 return <div className="nostr-onboarding__platforms" data-mobile={mobile}>
  <details className="nostr-onboarding__desktop-help" open={!mobile}>
   <summary>{mobile?"On desktop?":"On desktop"}</summary>
   <p>We recommend using Sidecar for secure signing</p>
   <div className="nostr-onboarding__app-links"><a href="https://sidecar.top" target="_blank" rel="noreferrer"><Image src="/brand/signers/sidecar.png" alt="" width={40} height={40}/><span>Sidecar — A Classy Nostr Signer</span><span aria-hidden="true">↗</span></a></div>
  </details>
  <details className="nostr-onboarding__mobile-help" open={mobile}>
   <summary>{mobile?"On mobile":"On mobile?"}</summary>
   <p>Use a bunker:// connection from Amber (Android) or Clave (iOS via TestFlight). Your signer keeps your private key.</p>
   <div className="nostr-onboarding__app-links">{[{name:"Amber (Android)",icon:"amber",href:"https://github.com/greenart7c3/Amber"},{name:"Clave (iOS via TestFlight)",icon:"clave",href:"https://testflight.apple.com/join/5Mx5AZx7"}].map(app=><SignerAppLink key={app.href} {...app}/>)}</div>
  </details>
 </div>;
}
