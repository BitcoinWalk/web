import {describe,expect,it} from "vitest";
import {guideInboxStatus} from "./guide-inbox-status";

const ready:PromiseFulfilledResult<string[]>={status:"fulfilled",value:["wss://inbox.example/"]};
const failed:PromiseRejectedResult={status:"rejected",reason:new Error("untrusted relay error")};
describe("Guide inbox connection feedback",()=>{
 it("identifies the failed inbox while retaining the other result",()=>{
  const result=guideInboxStatus(ready,failed);
  expect(result.guideRelays).toEqual(ready.value);
  expect(result.message).toContain("Your private inbox");
  expect(result.message).not.toContain("The Guide’s");
  expect(result.message).not.toContain("untrusted");
 });
 it("reports both missing inboxes, including empty successful discovery",()=>{
  const result=guideInboxStatus(failed,{status:"fulfilled",value:[]});
  expect(result.message).toContain("The Guide’s");expect(result.message).toContain("Your private inbox");
 });
 it("clears feedback when both inboxes are available",()=>{expect(guideInboxStatus(ready,ready).message).toBe("");});
});
