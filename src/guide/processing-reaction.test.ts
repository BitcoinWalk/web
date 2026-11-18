import {DatabaseSync} from "node:sqlite";
import {generateSecretKey,getPublicKey,verifyEvent,nip44,type Event} from "nostr-tools";
import {unwrapEvent} from "nostr-tools/nip59";
import {expect,it,vi} from "vitest";
import {GuideProcessingReactions,PROCESSING_FAILED} from "./processing-reaction";
import {unwrapNip17Message} from "../nostr/nip17-inbox";

it("sends an encrypted, expiring reaction and removes that exact reaction, without public question references",async()=>{
 const db=new DatabaseSync(":memory:"),guide=generateSecretKey(),user=generateSecretKey(),recipient=getPublicKey(user),id="a".repeat(64);
 const transport={now:()=>1000,discover:vi.fn(async()=>["wss://inbox.example/"]),publish:vi.fn<(event:Event,relays:string[])=>Promise<void>>(async()=>{})};
 try{
  const reactions=new GuideProcessingReactions(db,guide,transport);
  await reactions.start(id,recipient);
  const wrap=transport.publish.mock.calls[0][0];expect(verifyEvent(wrap)).toBe(true);
  expect(wrap.tags).toEqual([["p",recipient],["expiration","1300"]]);expect(JSON.stringify(wrap)).not.toContain(id);
  const rumor=unwrapEvent(wrap,user);expect(rumor).toMatchObject({kind:7,content:"👀",pubkey:getPublicKey(guide)});expect(rumor.tags).toContainEqual(["e",id]);
  const decrypt=async(peer:string,ciphertext:string)=>nip44.v2.decrypt(ciphertext,nip44.v2.utils.getConversationKey(user,peer));
  await expect(unwrapNip17Message(wrap,recipient,decrypt)).resolves.toMatchObject({kind:7,target:id,expiresAt:1300});
  await reactions.start(id,recipient);expect(JSON.stringify(transport.publish.mock.calls[1][0])).toBe(JSON.stringify(wrap));
  await reactions.clear(id,false);
  expect(unwrapEvent(transport.publish.mock.calls[2][0],user)).toMatchObject({kind:5,content:"",tags:[["p",recipient],["e",rumor.id],["k","7"]]});
  expect(db.prepare("SELECT COUNT(*) count FROM guide_processing_reaction").get()).toMatchObject({count:0});
 }finally{db.close();}
});

it("retains and retries the exact encrypted deletion after a failed cleanup",async()=>{
 const db=new DatabaseSync(":memory:"),guide=generateSecretKey(),user=generateSecretKey(),recipient=getPublicKey(user),id="a".repeat(64);
 const transport={now:()=>1000,discover:vi.fn(async()=>["wss://inbox.example/"]),publish:vi.fn<(event:Event,relays:string[])=>Promise<void>>(async()=>{})};
 try{
  const reactions=new GuideProcessingReactions(db,guide,transport);await reactions.start(id,recipient);
  transport.publish.mockRejectedValueOnce(new Error("offline"));await expect(reactions.clear(id,true)).rejects.toThrow("offline");
  const deletion=transport.publish.mock.calls[1][0];
  await new GuideProcessingReactions(db,guide,transport).retryCleanup(recipient);
  expect(transport.publish.mock.calls[2][0]).toEqual(deletion);
  expect(unwrapEvent(deletion,user).content).toBe(PROCESSING_FAILED);
 }finally{db.close();}
});
