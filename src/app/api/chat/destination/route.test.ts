import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({load:vi.fn()}));
vi.mock("../../../../server/chat-target",()=>({loadChatTarget:mocks.load,chatResolutionStatus:(value:{state:string})=>value.state==="invalid"?400:value.state==="not-found"?404:value.state==="unavailable"?503:200}));
import {GET} from "./route";

describe("public chat destination contract",()=>{
  beforeEach(()=>mocks.load.mockReset());
  it("returns the versioned resolved target without authentication or cacheable authority",async()=>{
    const body={version:1,state:"resolved",target:{version:1,kind:"hosts"},access:"signed-host-roster",transport:null};
    mocks.load.mockResolvedValue(body);
    const response=await GET(new Request("https://bitcoinwalk.org/api/chat/destination?path=%2Fchat%2Fhosts&role=super-admin"));
    expect(mocks.load).toHaveBeenCalledWith("/chat/hosts");expect(response.status).toBe(200);expect(await response.json()).toEqual(body);
    expect(response.headers.get("cache-control")).toBe("no-store");expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
  it.each(["", "?path=/chat/hosts&path=/chat/global"])("refuses missing or duplicate target parameters: %s",async query=>{
    mocks.load.mockResolvedValue({version:1,state:"invalid"});
    const response=await GET(new Request(`https://bitcoinwalk.org/api/chat/destination${query}`));
    expect(mocks.load).toHaveBeenCalledWith("");expect(response.status).toBe(400);
  });
  it.each([["not-found",404],["unavailable",503]] as const)("distinguishes %s",async(state,status)=>{
    mocks.load.mockResolvedValue({version:1,state});
    const response=await GET(new Request("https://bitcoinwalk.org/api/chat/destination?path=/chat/city/madeira"));expect(response.status).toBe(status);
  });
});
