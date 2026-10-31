"use client";
import {useState} from "react";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {idleCommandTemplate,type IdleCommand} from "../guide/idle-contract";

export function IdleReminderSettings({cityId}:{cityId:string}){
 const [preference,setPreference]=useState<{enabled:boolean;snooze:number;version:number}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[checkedAt,setCheckedAt]=useState(0);
 async function request(choice?:"on"|"off"|"30"|"90"){
  if(busy)return;setBusy(true);setMessage("");
  try{
   const actor=await getBrowserExtensionPubkey();
   const command:IdleCommand=choice&&preference?{action:"save",cityId,choice,version:preference.version}:{action:"read",cityId};
   const event=await signWithBrowserExtension(idleCommandTemplate(command,window.location.origin));
   if(event.pubkey!==actor)throw Error("Account changed. Please check again.");
   const response=await fetch("/api/guide-reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"});
   const data=await response.json();if(!response.ok)throw Error(data.error??"Could not save reminders.");
   if(await getBrowserExtensionPubkey()!==actor)throw Error("Account changed. Please check again.");
   setPreference(data.preference);setCheckedAt(Date.now()/1000);setMessage(`${choice?"Saved. ":""}${data.paused?"Reminder sending is currently paused.":"Reminder settings checked."}`);
  }catch(error){setPreference(null);setMessage(error instanceof Error?error.message:"Could not check reminders.");}finally{setBusy(false);}
 }
 return <section aria-labelledby="idle-reminders-heading" aria-busy={busy}>
  <h3 id="idle-reminders-heading">Guide reminders</h3>
  <p>No next walk planned? The Guide can send a private reminder after seven idle days and one follow-up fourteen days later, then stop. Only the city owner can change these settings.</p>
  {!preference?<button type="button" disabled={busy} onClick={()=>request()}>Check reminder settings</button>:<label>Reminders for this city<select disabled={busy} value={!preference.enabled?"off":preference.snooze>checkedAt?"snoozed":"on"} onChange={event=>request(event.target.value as "on"|"off"|"30"|"90")}><option value="on">On</option><option value="off">Off</option>{preference.snooze>checkedAt&&<option value="snoozed" disabled>Paused until {new Date(preference.snooze*1000).toLocaleDateString()}</option>}<option value="30">Snooze for 30 days</option><option value="90">Snooze for 90 days</option></select></label>}
  <p role="status">{busy?"Checking with your signer…":message}</p>
 </section>;
}
