import {expect,it} from "vitest";
import type {Nip17Message} from "./nip17-inbox";
import {guideConversation} from "./guide-processing";

const question:Nip17Message={id:"q",wrapId:"q",pubkey:"actor",recipient:"guide",content:"Bitcoin question",createdAt:1};
const reaction:Nip17Message={id:"r",wrapId:"r",pubkey:"guide",recipient:"actor",content:"👀",createdAt:2,kind:7,target:"q",expiresAt:302};
const remove:Nip17Message={...reaction,id:"d",wrapId:"d",kind:5,target:"r",content:"",createdAt:3};
it("attaches eyes to the exact question and excludes controls from chat messages",()=>{
 expect(guideConversation([reaction,question],"actor","guide")).toEqual([{...question,processingUntil:302}]);
 expect(guideConversation([question,reaction,remove],"actor","guide")).toEqual([question]);
 expect(guideConversation([remove,question,reaction],"actor","guide")).toEqual([question]);
});
it("ignores another author's deletion and another conversation's reaction",()=>{
 expect(guideConversation([question,reaction,{...remove,pubkey:"attacker"}],"actor","guide")[0].processingUntil).toBe(302);
 expect(guideConversation([question,{...reaction,recipient:"other"}],"actor","guide")).toEqual([question]);
 expect(guideConversation([question,{...reaction,pubkey:"attacker"}],"actor","guide")).toEqual([question]);
});
it("shows failures but hides eyes as soon as a reply to that exact question arrives",()=>{
 expect(guideConversation([question,reaction,{...remove,content:"failed"}],"actor","guide")[0].processingFailed).toBe(true);
 const answer:Nip17Message={...question,id:"answer",pubkey:"guide",recipient:"actor",target:"q",createdAt:3};
 expect(guideConversation([question,reaction,answer],"actor","guide")[0]).toEqual(question);
 expect(guideConversation([question,reaction,{...answer,target:"other"}],"actor","guide")[0].processingUntil).toBe(302);
});
