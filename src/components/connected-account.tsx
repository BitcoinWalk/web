"use client";

import NostrUser from "./nostr-user";
import styles from "./connected-account.module.css";

export default function ConnectedAccount({pubkey,disabled,onDisconnect}:{pubkey:string;disabled:boolean;onDisconnect:()=>void}){
 return <div className={styles.connected} aria-label="Connected account">
  <div className={styles.account}>
  <p className={styles.status}><span aria-hidden="true">✓</span> Account connected</p>
  <NostrUser key={pubkey} pubkey={pubkey} variant="compact" connectedAccount showLightning={false} copyValues={false}/>
  </div>
  <button type="button" disabled={disabled} onClick={onDisconnect}>Use a different account for bitcoin walk</button>
 </div>;
}
