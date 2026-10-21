import {describe,it,expect} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey} from "nostr-tools";
import {hannoverConfigSchema,hannoverCityId,hannoverMessage,hannoverRecipient,prepareHannoverDelivery} from "./hannover-followup";
describe("one-time Hannover follow-up",()=>{
 const config={discoveryRelays:["wss://relay.primal.net/"],allowedInboxRelays:["wss://relay.primal.net/"],recipients:["a".repeat(64)],proSetupStatusURL:"http://127.0.0.1:3345/api/pro-setup-notifications"};
 it("ignores unused worker settings including the deployed source listener",()=>{
  expect(hannoverConfigSchema.parse({...config,sourceReadRelay:"ws://127.0.0.1:3340/"})).toEqual(config);
 });
 it("retains restrictions on every setting used to send a message",()=>{
  for(const change of [{proSetupStatusURL:undefined},{proSetupStatusURL:"http://127.0.0.1:3338/api/pro-setup-notifications"},{discoveryRelays:["ws://127.0.0.1:3340/"]},{allowedInboxRelays:["wss://example.com/?secret=bad"]},{allowedInboxRelays:[]},{recipients:["invalid"]}])expect(()=>hannoverConfigSchema.parse({...config,...change})).toThrow();
 });
 const task={cityId:hannoverCityId,cityName:"Hannover",ownerPubkey:"a".repeat(64),updatedAt:1,kind:"setup" as const,state:"setup-required" as const};
 it("uses only the current Hannover owner and refuses stale or ambiguous tasks",()=>{
  expect(hannoverRecipient([task])).toBe(task.ownerPubkey);
  expect(()=>hannoverRecipient([])).toThrow();expect(()=>hannoverRecipient([task,task])).toThrow();
  expect(()=>hannoverRecipient([{...task,state:"awaiting-review"}])).toThrow();
  expect(()=>hannoverRecipient([{...task,cityId:"other"}])).toThrow();
 });
 it("reuses encrypted delivery across retries and preserves acknowledgement",()=>{
  const db=new DatabaseSync(":memory:"),secret=generateSecretKey();
  try{const first=prepareHannoverDelivery(db,task.ownerPubkey,secret);expect(first.acknowledged).toBe(false);
   expect(first.event.content).not.toContain(hannoverMessage);
   expect(prepareHannoverDelivery(db,task.ownerPubkey,secret).event.id).toBe(first.event.id);
   db.prepare("UPDATE delivery SET acknowledged=1").run();expect(prepareHannoverDelivery(db,task.ownerPubkey,secret).acknowledged).toBe(true);
   expect(()=>prepareHannoverDelivery(db,"b".repeat(64),secret)).toThrow();
   expect(()=>prepareHannoverDelivery(db,task.ownerPubkey,generateSecretKey())).toThrow();
  }finally{db.close();secret.fill(0);}
 });
});
