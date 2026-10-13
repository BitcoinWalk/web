import {describe,expect,it} from "vitest";
import nextConfig from "../../next.config";

describe("global community aliases",()=>{
 it("redirects canonical and legacy app paths to the exact verified Armada group",async()=>{
  const redirects=await nextConfig.redirects?.();
  const expected="https://armada.buzz/s/chat.bitcoinwalk.org/13bc3a423b4f2954";
  for(const source of ["/join","/join-chat"]){
   expect(redirects).toContainEqual({source,destination:expected,permanent:true});
  }
 });
 it("does not redirect an alias to itself",async()=>{
  const redirects=await nextConfig.redirects?.()??[];
  for(const redirect of redirects)expect(redirect.destination).not.toBe(redirect.source);
 });
});
