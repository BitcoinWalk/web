import {finalizeEvent,getPublicKey} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
vi.mock("./authority",()=>({isSuperAdmin:(value:string)=>value===getPublicKey(new Uint8Array(32).fill(1))}));
import {armadaProvisionRequest,authorizeArmadaProvision} from "./armada-provision-request";

describe("Armada provisioning authorization",()=>{it("binds the exact action, origin and endpoint",()=>{const key=new Uint8Array(32).fill(1),origin="https://bitcoinwalk.org",action={action:"verify" as const,cityId:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a",slug:"bangkok",groupId:"bitcoinwalk-bangkok",picture:`${origin}/api/og/files/${"a".repeat(64)}.jpg`},event=finalizeEvent(armadaProvisionRequest(action,origin,100),key);expect(authorizeArmadaProvision(event,action,origin,100)).toBe(getPublicKey(key));expect(()=>authorizeArmadaProvision(event,{...action,groupId:"other"},origin,100)).toThrow("Signed super-admin");expect(()=>authorizeArmadaProvision(event,action,"https://app-staging.bitcoinwalk.org",100)).toThrow("Signed super-admin");});});
