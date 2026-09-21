import {beforeEach,describe,expect,it,vi} from "vitest";
import {relayConfig} from "../../../../lib/relay-config";
import {pendingCityRevisions,queryApprovals,queryCityRevisions} from "../../../../nostr/city-records";
import {GET} from "./route";

vi.mock("../../../../lib/relay-config",()=>({relayConfig:{readRelays:[],writeRelays:[]}}));
vi.mock("../../../../nostr/city-records",()=>({
  pendingCityRevisions:vi.fn(),
  queryApprovals:vi.fn(),
  queryCityRevisions:vi.fn(),
}));

describe("pending submissions route",()=>{
  beforeEach(()=>{
    relayConfig.readRelays=[];
    vi.clearAllMocks();
  });

  it("does not query a relay when no read relay is configured",async()=>{
    const response=await GET();
    expect(await response.json()).toEqual({configured:false,submissions:[]});
    expect(queryCityRevisions).not.toHaveBeenCalled();
    expect(queryApprovals).not.toHaveBeenCalled();
  });

  it("returns only the public queue summary",async()=>{
    relayConfig.readRelays=["wss://relay.example"];
    vi.mocked(queryCityRevisions).mockResolvedValue([]);
    vi.mocked(queryApprovals).mockResolvedValue([]);
    vi.mocked(pendingCityRevisions).mockReturnValue([{
      event:{id:"revision-id",pubkey:"author-key",content:"signed private detail"},
      city:{cityId:"city-id",cityName:"Funchal",startAt:"2026-09-26T10:00:00.000Z",meetingPoint:{description:"Town square"},description:"Do not expose full proposal"},
    }] as unknown as ReturnType<typeof pendingCityRevisions>);

    const response=await GET();
    expect(response.status).toBe(200);
    expect(queryCityRevisions).toHaveBeenCalledWith(relayConfig.readRelays);
    expect(queryApprovals).toHaveBeenCalledWith(relayConfig.readRelays);
    expect(await response.json()).toEqual({configured:true,submissions:[{
      eventId:"revision-id",cityId:"city-id",cityName:"Funchal",startAt:"2026-09-26T10:00:00.000Z",meetingPoint:"Town square",
    }]});
  });
});
