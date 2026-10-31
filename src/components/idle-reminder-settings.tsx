"use client";
import {useRef,useState} from "react";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {idleCommandTemplate,type IdleCommand} from "../guide/idle-contract";
import styles from "./idle-reminder-settings.module.css";

type Choice="on"|"off"|"30"|"90";
type Saved={preference:{enabled:boolean;snooze:number;version:number};paused:boolean;checkedAt:number};
export function IdleReminderSettingsView({saved,busy,message,error,onRequest}:{saved:Saved|null;busy:"read"|"save"|null;message:string;error:string;onRequest:(choice?:Choice)=>void}){
 const snoozed=Boolean(saved&&saved.preference.snooze>saved.checkedAt),date=snoozed?new Date(saved!.preference.snooze*1000).toLocaleDateString():"";
 const title=!saved?"Status not checked":saved.paused?"Not sending — paused by BitcoinWalk":!saved.preference.enabled?"Not sending — you switched reminders off":snoozed?`Not sending — snoozed until ${date}`:"On — reminders can be sent when eligible";
 const explanation=!saved?"Load your saved preference to check both your choice and BitcoinWalk’s sending status.":saved.paused?"No reminders will be sent while BitcoinWalk has sending paused, even if your saved preference is On.":!saved.preference.enabled?"Your saved preference is Off. You will not receive idle-walk reminders for this city.":snoozed?"Your preference is saved. Reminders will not be sent before this date.":"On does not send a message now. The first reminder requires seven verified idle days; there is at most one follow-up fourteen days later.";
 return <section className={styles.panel} aria-labelledby="idle-reminders-heading" aria-busy={Boolean(busy)}>
  <header><p className={styles.eyebrow}>Private settings · no review needed</p><h3 id="idle-reminders-heading">Guide reminders</h3><p>Friendly private nudges when your city has no next walk planned.</p></header>
  <div className={styles.status} data-paused={saved?.paused||undefined} aria-live="polite"><strong>{title}</strong><p>{explanation}</p></div>
  <div className={styles.control}>
   {saved?<label>Your saved preference<select aria-describedby="reminder-autosave" disabled={Boolean(busy)} value={!saved.preference.enabled?"off":snoozed?"snoozed":"on"} onChange={event=>onRequest(event.target.value as Choice)}><option value="on">On — allow reminders when sending is available</option><option value="off">Off — no reminders for this city</option>{snoozed&&<option value="snoozed" disabled>Snoozed until {date}</option>}<option value="30">Snooze for 30 days</option><option value="90">Snooze for 90 days</option></select></label>:<button type="button" disabled={Boolean(busy)} onClick={()=>onRequest()}>{error?"Reload saved preference":"Load saved preference"}</button>}
   <p id="reminder-autosave" className={styles.help}>Changes save automatically here after you approve the signer request. No “Submit for approval” button or city-profile submission is needed.</p>
   <p className={styles.feedback} role="status">{busy==="save"?"Saving your preference… Approve the request in your signer.":busy==="read"?"Loading your saved preference… Approve the request in your signer.":message}</p>
   {error&&<p className={styles.error} role="alert">Could not confirm the saved preference. {error} Reload before trying again.</p>}
  </div>
  <details><summary>How reminders work</summary><p>After seven verified days without an active or upcoming walk, the Guide can send one reminder and one follow-up fourteen days later, then stop. Scheduling a walk, switching reminders off or snoozing cancels queued reminders. Only the current city owner can change these settings.</p></details>
 </section>;
}

export function IdleReminderSettings({cityId}:{cityId:string}){
 const [saved,setSaved]=useState<Saved|null>(null),[busy,setBusy]=useState<"read"|"save"|null>(null),[message,setMessage]=useState(""),[error,setError]=useState(""),lock=useRef(false);
 async function request(choice?:Choice){
  if(lock.current)return;lock.current=true;setBusy(choice?"save":"read");setMessage("");setError("");
  try{
   const actor=await getBrowserExtensionPubkey();
   const command:IdleCommand=choice&&saved?{action:"save",cityId,choice,version:saved.preference.version}:{action:"read",cityId};
   const event=await signWithBrowserExtension(idleCommandTemplate(command,window.location.origin));
   if(event.pubkey!==actor)throw Error("Account changed. Please check again.");
   const response=await fetch("/api/guide-reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store",signal:AbortSignal.timeout(30000)});
   const data=await response.json();if(!response.ok)throw Error(data.error??"Could not save reminders.");
   if(await getBrowserExtensionPubkey()!==actor)throw Error("Account changed. Please check again.");
   setSaved({preference:data.preference,paused:data.paused,checkedAt:Date.now()/1000});setMessage(choice?"✓ Saved automatically. Nothing else to submit.":"Saved preference loaded. Nothing to submit.");
  }catch(error){setSaved(null);setError(error instanceof Error?error.message:"Could not check reminders.");}finally{lock.current=false;setBusy(null);}
 }
 return <IdleReminderSettingsView saved={saved} busy={busy} message={message} error={error} onRequest={choice=>void request(choice)}/>;
}
