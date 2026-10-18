import {finalizeEvent,generateSecretKey,getPublicKey,nip44} from "nostr-tools";
import {wrapEvent} from "nostr-tools/nip59";
import {describe,expect,it} from "vitest";
import {guideMessages,openGuideGiftWrap} from "./nip17-chat";

const guideSecret=generateSecretKey(),recipientSecret=generateSecretKey(),guide=getPublicKey(guideSecret),recipient=getPublicKey(recipientSecret);
const decrypt=(pubkey:string,ciphertext:string)=>Promise.resolve(nip44.decrypt(ciphertext,nip44.getConversationKey(recipientSecret,pubkey)));

describe("NIP-17 Guide chat",()=>{
 it("opens and orders only authentic Guide messages addressed to the connected recipient",async()=>{
  const later=wrapEvent({kind:14,created_at:200,tags:[["p",recipient]],content:"Welcome to BitcoinWalk Pro."},guideSecret,recipient),earlier=wrapEvent({kind:14,created_at:100,tags:[["p",recipient]],content:"Welcome to BitcoinWalk."},guideSecret,recipient),otherSecret=generateSecretKey(),other=wrapEvent({kind:14,created_at:300,tags:[["p",recipient]],content:"unrelated"},otherSecret,recipient);
  expect((await guideMessages([later,other,earlier],recipient,guide,decrypt)).map(row=>row.content)).toEqual(["Welcome to BitcoinWalk.","Welcome to BitcoinWalk Pro."]);
 });
 it("rejects altered, misaddressed and non-Guide envelopes",async()=>{
  const valid=wrapEvent({kind:14,created_at:100,tags:[["p",recipient]],content:"Welcome"},guideSecret,recipient),otherRecipient=getPublicKey(generateSecretKey()),wrong=wrapEvent({kind:14,created_at:100,tags:[["p",otherRecipient]],content:"Wrong recipient"},guideSecret,recipient),altered=finalizeEvent({...valid,content:`${valid.content}x`},generateSecretKey());
  expect(await openGuideGiftWrap(wrong,recipient,guide,decrypt)).toBeNull();
  expect(await openGuideGiftWrap(altered,recipient,guide,decrypt)).toBeNull();
 });
});
