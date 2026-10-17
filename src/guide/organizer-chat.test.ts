import {generateSecretKey,getPublicKey} from "nostr-tools";
import {describe,expect,it} from "vitest";
import {readGuideOrganizerChatHosts} from "./organizer-chat";

describe("Guide Hosts invitations",()=>{
 it("uses the action-bound request and parses only the safe projection",async()=>{
  const owner=getPublicKey(generateSecretKey()),request=async(_url:string,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));expect(JSON.parse(body.event.content)).toEqual({action:"list-organizer-chat-invitations"});return new Response(JSON.stringify({version:1,hosts:[{ownerPubkey:owner,cityNames:["London"]}],checkedAt:"2026-10-17T20:00:00.000Z"}),{status:200,headers:{"Content-Type":"application/json"}});};
  await expect(readGuideOrganizerChatHosts(generateSecretKey(),"http://127.0.0.1:3338/api/organizer-chat-invitations",request as typeof fetch)).resolves.toEqual([{ownerPubkey:owner,cityNames:["London"]}]);
 });
});
