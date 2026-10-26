"use client";

import NostrUser from "./nostr-user";
import styles from "./connected-account.module.css";

export default function ConnectedAccount({pubkey,disabled,onDisconnect}:{pubkey:string;disabled:boolean;onDisconnect:()=>void}){
 return <div className={styles.connected} aria-label="Connected account">
  <p className={styles.status}><span aria-hidden="true">✓</span> Account connected</p>
  <NostrUser key={pubkey} pubkey={pubkey} variant="compact" showLightning={false} copyValues={false}/>
  <button type="button" disabled={disabled} onClick={onDisconnect}>Use another account</button>
 </div>;
}
