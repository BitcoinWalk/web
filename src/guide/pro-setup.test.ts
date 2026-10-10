import {describe,expect,it} from "vitest";
import {generateSecretKey} from "nostr-tools";
import {readGuideProSetupTasks} from "./pro-setup";

describe("Guide Pro setup feed",()=>{
 it("uses the exact signed read-only action and validates the bounded response",async()=>{
  const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f",owner="a".repeat(64);
  const task={cityId,cityName:"Madeira",ownerPubkey:owner,kind:"setup" as const,state:"setup-required" as const,updatedAt:100};
  const request=async(_url:string,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));expect(JSON.parse(body.event.content)).toEqual({action:"list-pro-setup-notifications"});return new Response(JSON.stringify({version:1,tasks:[task],checkedAt:"2026-10-10T10:00:00.000Z"}),{status:200,headers:{"Content-Type":"application/json"}});};
  await expect(readGuideProSetupTasks(generateSecretKey(),"http://127.0.0.1:3345/api/pro-setup-notifications",request as typeof fetch)).resolves.toEqual([task]);
 });
});
