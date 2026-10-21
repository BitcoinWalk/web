import {describe,it,expect} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey} from "nostr-tools";
import {hannoverCityId,hannoverMessage,hannoverRecipient,prepareHannoverDelivery} from "./hannover-followup";
describe("one-time Hannover follow-up",()=>{
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
