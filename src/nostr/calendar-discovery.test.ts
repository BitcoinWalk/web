import {generateSecretKey,finalizeEvent,type Event} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import {calendarDiscoverySummary,publishCalendarDiscoveryEvent} from "./calendar-discovery";

const event=finalizeEvent({kind:31923,created_at:1,content:"Walk",tags:[["d","walk"],["title","BitcoinWalk Test"],["start","2000000000"],["D","23148"],["location","Square"]]},generateSecretKey());

describe("calendar discovery fanout",()=>{
  it("requires exact independent read-back and reports partial success without changing the signature",async()=>{
    const relays=["wss://one.example/","wss://two.example/"];
    const publish=vi.fn(async(_event:Event,targets:string[])=>({accepted:targets,rejected:[]}));
    const read=vi.fn(async(relay:string)=>relay===relays[0]?[event]:[]);
    const report=await publishCalendarDiscoveryEvent(event,relays,publish,read);
    expect(report.eventId).toBe(event.id);
    expect(report.verified).toEqual([relays[0]]);
    expect(report.failed).toEqual([{relay:relays[1],reason:"acknowledged but exact signed event was not read back"}]);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.every(call=>call[0]===event)).toBe(true);
    expect(calendarDiscoverySummary(report,2)).toContain("1/2");
  });

  it("contains relay rejection details while returning a retryable report",async()=>{
    const report=await publishCalendarDiscoveryEvent(event,["wss://one.example/"],vi.fn().mockRejectedValue(new Error("blocked")),vi.fn());
    expect(report.verified).toEqual([]);
    expect(report.failed).toEqual([{relay:"wss://one.example/",reason:"blocked"}]);
  });

  it("fails closed for invalid kinds and relay configuration",async()=>{
    const other=finalizeEvent({kind:1,created_at:1,content:"note",tags:[]},generateSecretKey());
    await expect(publishCalendarDiscoveryEvent(other,["wss://one.example/"])).rejects.toThrow("Only calendar");
    await expect(publishCalendarDiscoveryEvent(event,[])).rejects.toThrow("between one and five");
    await expect(publishCalendarDiscoveryEvent(event,["wss://one.example/","wss://one.example/"])).rejects.toThrow("unique WSS");
  });
});
