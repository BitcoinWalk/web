import {DatabaseSync} from "node:sqlite";
import {describe,it,expect} from "vitest";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {IdleReminderPreferences} from "./idle-reminder-preferences";
import {authorizeIdleCommand,idleCommandTemplate} from "../guide/idle-contract";
const city="10000000-0000-4000-8000-000000000001";
describe("private idle settings",()=>{
 it("isolates owners, bounds snooze and prevents replay from undoing newer settings",()=>{
  const db=new DatabaseSync(":memory:");try{const store=new IdleReminderPreferences(db),command={action:"save" as const,cityId:city,choice:"30" as const,version:0};
   expect(store.read(city,"owner")).toEqual({enabled:true,snooze:0,version:0});
   expect(store.save(city,"owner",command,100)).toEqual({enabled:true,snooze:100+30*86400,version:1});
   expect(()=>store.save(city,"owner",command,200)).toThrow();expect(store.read(city,"new-owner").snooze).toBe(0);
   expect(store.save(city,"owner",{...command,version:1,choice:"off"},300).enabled).toBe(false);
  }finally{db.close();}
 });
 it("binds signatures to origin, action, payload and freshness",()=>{
  const now=1000,origin="https://bitcoinwalk.org",event=finalizeEvent(idleCommandTemplate({action:"read",cityId:city},origin,now),generateSecretKey());
  expect(authorizeIdleCommand(event,origin,now).action).toBe("read");expect(()=>authorizeIdleCommand(event,"https://app-staging.bitcoinwalk.org",now)).toThrow();expect(()=>authorizeIdleCommand(event,origin,now+301)).toThrow();expect(()=>authorizeIdleCommand({...event,content:"{}"},origin,now)).toThrow();
 });
});
