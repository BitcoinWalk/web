import styles from "./chat.module.css";

export function ChatRoomInfo({label,name,participants,relay,privateGroup=false,guide=false}:{label:string;name?:string;participants?:number;relay?:string;privateGroup?:boolean;guide?:boolean}){
 return <div className={styles.roomDetail}>
  <p><strong>{label}</strong>{participants!==undefined&&<span> · {participants} {participants===1?"participant":"participants"}</span>}{privateGroup&&<span> · Members only</span>}{guide&&<span> · Encrypted messages</span>}</p>
  <details className={styles.roomInfo}>
   <summary>Chat info</summary>
   <div className={styles.infoPanel}>
    <strong>{label}</strong>
    {guide?<p>End-to-end encrypted NIP-17 messages. Only this account can open its inbox. Replies are not monitored yet.</p>:<><p>{privateGroup?"A members-only group, not end-to-end encrypted.":"A public community, not end-to-end encrypted."} Messages are readable by the relay. Never share private keys or payout credentials.</p>{name&&<p>Channel <span>#{name}</span></p>}{relay&&<p>Relay <span>{relay}</span></p>}</>}
   </div>
  </details>
 </div>;
}

export function ChatComposerTips(){
 return <details className={styles.composerTips}><summary aria-label="Message tips" title="Message tips">?</summary><p>Drafts and photos stay with this account and chat.<br/>Enter to send · Shift+Enter for a new line · Type @ to tag someone</p></details>;
}
