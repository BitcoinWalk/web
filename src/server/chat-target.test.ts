import {beforeEach,describe,expect,it,vi} from "vitest";
import type {CalendarSource} from "../nostr/calendar-records";
import type {ChatConfig} from "../domain/chat";
import fixtures from "../domain/fixtures/chat-targets-v1.json";

const mocks=vi.hoisted(()=>({cities:vi.fn(),config:vi.fn()}));
vi.mock("./share-preview",()=>({loadSharedCities:mocks.cities}));
vi.mock("./chat-config",()=>({serverChatConfig:mocks.config}));
import {resolveChatTarget,loadChatTarget,serveChatLink,chatResolutionStatus} from "./chat-target";

const relay="wss://chat.bitcoinwalk.org/";
const city=(cityId:string,slug:string,aliases:string[]=[])=>({revision:{city:{cityId,slug,aliases}}}) as CalendarSource;
const makeRegistry=()=>({cities:[city("city-madeira","madeira"),city("city-london","london")],guidePubkey:"a".repeat(64),config:{environment:"production",global:{relay,groupId:"global-current"},paidCities:{"city-madeira":{slug:"madeira",tier:"basic",destination:null,walkieTalkieDestination:{relay,groupId:"madeira-current"},walkieTalkieEnabled:true},"city-london":{slug:"london",tier:"pro",destination:null,walkieTalkieDestination:{relay,groupId:"london-current"},walkieTalkieEnabled:true}}} as ChatConfig});

describe("current chat destination resolver",()=>{
  beforeEach(()=>{vi.clearAllMocks();const registry=makeRegistry();mocks.cities.mockResolvedValue(registry.cities);mocks.config.mockReturnValue(registry.config);});
  it.each(fixtures.cases)("resolves the shared $path fixture without an account",row=>{
    expect(resolveChatTarget(row.path,makeRegistry())).toMatchObject({version:1,state:"resolved",target:row.target});
  });
  it("resolves both Basic and Pro city groups independently from Global",()=>{
    for(const slug of ["madeira","london"]){
      expect(resolveChatTarget(`/chat/${slug}`,makeRegistry())).toMatchObject({state:"resolved",transport:{protocol:"nip29",destination:{relay,groupId:`${slug}-current`}}});
    }
  });
  it("uses current rotation data rather than encoding a group in the permanent URL",()=>{
    const registry=makeRegistry();registry.config.paidCities["city-madeira"].walkieTalkieDestination={relay,groupId:"rotated"};
    expect(resolveChatTarget("/chat/madeira",registry)).toMatchObject({canonicalPath:"/chat/madeira",transport:{destination:{groupId:"rotated"}}});
  });
  it("maps an approved former slug and immutable ID to the same current city",()=>{
    const registry=makeRegistry();registry.cities[0]=city("city-madeira","madeira-new",["Madeira"]);registry.config.paidCities["city-madeira"].slug="madeira-new";
    for(const path of ["/chat/madeira","/chat/city-madeira","/chat/city/madeira","/chat/city/city-madeira"])
      expect(resolveChatTarget(path,registry)).toMatchObject({target:{cityId:"city-madeira"},canonicalPath:"/chat/madeira-new",webPath:"/admin/chat?city=madeira-new"});
  });
  it("refuses archived, unknown and ambiguous cities",()=>{
    const registry=makeRegistry();registry.cities=[];
    expect(resolveChatTarget("/chat/madeira",registry)).toEqual({version:1,state:"not-found"});
    registry.cities=[city("a","one",["Old"]),city("b","two",["Old"])];
    expect(resolveChatTarget("/chat/old",registry).state).toBe("not-found");
  });
  it("does not fall back to Global or route a stale city registration to its neighbor",()=>{
    const registry=makeRegistry();delete registry.config.paidCities["city-madeira"];
    expect(resolveChatTarget("/chat/madeira",registry).state).toBe("unavailable");
    registry.config.paidCities["city-madeira"]={...registry.config.paidCities["city-london"]};
    expect(resolveChatTarget("/chat/madeira",registry).state).toBe("unavailable");
  });
  it("honors disabled public groups and missing Guide configuration",()=>{
    const registry=makeRegistry();registry.config.paidCities["city-madeira"].walkieTalkieEnabled=false;registry.guidePubkey="";registry.config.global=null;
    for(const path of ["/chat/madeira","/chat/guide","/chat/global"])expect(resolveChatTarget(path,registry).state).toBe("unavailable");
  });
  it("exposes no Hosts coordinates, roster, membership claim or join capability",()=>{
    expect(resolveChatTarget("/chat/hosts",makeRegistry())).toEqual({version:1,state:"resolved",target:{version:1,kind:"hosts"},canonicalPath:"/chat/hosts",webPath:"/admin/chat?room=hosts",access:"signed-host-roster",transport:null});
  });
  it("drops URL role, account, destination and redirect claims before opening the web room",async()=>{
    const response=await serveChatLink(new Request("https://bitcoinwalk.org/chat/hosts?role=super-admin&join=1&next=https://evil.example"));
    expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("/admin/chat?room=hosts");expect(response.headers.get("cache-control")).toBe("no-store");expect(mocks.cities).not.toHaveBeenCalled();
  });
  it("redirects approved aliases through the canonical URL",async()=>{
    mocks.cities.mockResolvedValue([city("city-madeira","madeira",["Funchal"])]);
    const response=await serveChatLink(new Request("https://bitcoinwalk.org/chat/funchal"));
    expect(response.headers.get("location")).toBe("/chat/madeira");
  });
  it.each(["/chat/city/madeira","/chat/city/funchal","/chat/funchal"])("redirects legacy or renamed path %s to the short canonical link",async path=>{
    mocks.cities.mockResolvedValue([city("city-madeira","madeira",["Funchal"])]);
    const response=await serveChatLink(new Request(`https://bitcoinwalk.org${path}?join=1&role=host`));
    expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("/chat/madeira");
  });
  it("opens the short canonical city link without an intermediate redirect",async()=>{
    const response=await serveChatLink(new Request("https://bitcoinwalk.org/chat/madeira?room=hosts"));
    expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("/admin/chat?city=madeira");
  });
  it("returns not-found for an unknown short city rather than treating it as malformed",async()=>{
    expect(chatResolutionStatus(await loadChatTarget("/chat/unknown"))).toBe(404);
  });
  it.each([
    ["/chat/unknown","/admin/chat?city=unknown"],
    ["/chat/city/unknown","/admin/chat?city=unknown"],
    ["/chat/global","/admin/chat?room=global"],
    ["/chat/guide","/admin/chat?room=guide"],
  ])("opens a dashboard recovery state for unresolved human link %s",async(path,location)=>{
    const registry=makeRegistry();registry.config.global=null;registry.guidePubkey="";mocks.cities.mockResolvedValue(registry.cities);mocks.config.mockReturnValue(registry.config);
    const response=await serveChatLink(new Request(`https://bitcoinwalk.org${path}?role=super-admin&join=1`));
    expect(response.status).toBe(307);expect(response.headers.get("location")).toBe(location);
  });
  it("opens the exact known city recovery state when its group is unavailable",async()=>{
    const registry=makeRegistry();delete registry.config.paidCities["city-madeira"];mocks.config.mockReturnValue(registry.config);
    const response=await serveChatLink(new Request("https://bitcoinwalk.org/chat/madeira?fallback=global"));
    expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("/admin/chat?city=madeira");
  });
  it("does not let city names or aliases shadow reserved rooms",()=>{
    const registry=makeRegistry();registry.cities[0]=city("city-madeira","hosts",["Madeira"]);
    expect(resolveChatTarget("/chat/madeira",registry).state).toBe("unavailable");
    expect(resolveChatTarget("/chat/hosts",registry)).toMatchObject({target:{kind:"hosts"},transport:null});
    for(const room of ["guide","global"]){
      registry.cities[0]=city("city-madeira",room);
      expect(resolveChatTarget(`/chat/${room}`,registry)).toMatchObject({target:{kind:room}});
    }
  });
  it("reports relay failure truthfully and avoids loading the directory for malformed paths",async()=>{
    mocks.cities.mockRejectedValue(new Error("private transport details"));
    expect(await loadChatTarget("/chat/madeira")).toEqual({version:1,state:"unavailable"});
    expect(chatResolutionStatus(await loadChatTarget("/chat/missing"))).toBe(503);
    mocks.cities.mockClear();expect(await loadChatTarget("/chat/madeira/extra")).toEqual({version:1,state:"invalid"});expect(mocks.cities).not.toHaveBeenCalled();
  });
});
