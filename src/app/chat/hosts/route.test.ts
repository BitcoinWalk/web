import {describe,expect,it,vi} from "vitest";
vi.mock("../../../server/chat-config",()=>({serverChatConfig:()=>({environment:"production",global:null,paidCities:{}})}));
vi.mock("../../../server/share-preview",()=>({loadSharedCities:vi.fn()}));
import {GET} from "./route";

describe("Hosts universal link",()=>{it("falls back to the Hosts conversation in the web dashboard",async()=>{const response=await GET(new Request("https://bitcoinwalk.org/chat/hosts"));expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("/admin/chat?room=hosts");});});
