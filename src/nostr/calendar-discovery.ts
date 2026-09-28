import {verifyEvent,type Event} from "nostr-tools";
import {queryRelayEvents} from "./city-records";
import {publishVerifiedEvent,type RelayPublication} from "./relay";

export type CalendarDiscoveryReport={
  eventId:string;
  verified:string[];
  failed:Array<{relay:string;reason:string}>;
};

type Publish=(event:Event,relays:string[],minimumAcknowledgements:number)=>Promise<RelayPublication>;
type Read=(relay:string,event:Event)=>Promise<Event[]>;

const defaultRead:Read=(relay,event)=>queryRelayEvents([relay],[event.kind],undefined,{ids:[event.id],limit:1});

/**
 * Fan out one already-signed public occurrence or cancellation. Each relay is
 * independently acknowledged and read back by exact event ID. The authoritative
 * BitcoinWalk publication is deliberately handled by the caller first.
 */
export async function publishCalendarDiscoveryEvent(
  event:Event,
  relays:string[],
  publish:Publish=publishVerifiedEvent,
  read:Read=defaultRead,
):Promise<CalendarDiscoveryReport>{
  if(!verifyEvent(event))throw new Error("Refusing to fan out an event with an invalid signature.");
  if(event.kind!==31923&&event.kind!==5)throw new Error("Only calendar occurrences and their signed cancellations can use discovery fanout.");
  if(!relays.length||relays.length>5)throw new Error("Configure between one and five calendar discovery relays.");
  if(new Set(relays).size!==relays.length||relays.some(relay=>!relay.startsWith("wss://")))throw new Error("Calendar discovery relays must be unique WSS URLs.");

  const outcomes=await Promise.all(relays.map(async relay=>{
    try{
      await publish(event,[relay],1);
      const events=await read(relay,event);
      if(!events.some(item=>item.id===event.id&&item.kind===event.kind&&verifyEvent(item)))throw new Error("acknowledged but exact signed event was not read back");
      return {relay,verified:true as const};
    }catch(error){
      return {relay,verified:false as const,reason:error instanceof Error?error.message:String(error)};
    }
  }));
  return {
    eventId:event.id,
    verified:outcomes.filter(result=>result.verified).map(result=>result.relay),
    failed:outcomes.filter((result):result is {relay:string;verified:false;reason:string}=>!result.verified).map(({relay,reason})=>({relay,reason})),
  };
}

export function calendarDiscoverySummary(report:CalendarDiscoveryReport,total:number):string{
  const suffix=report.failed.length?` ${report.failed.map(({relay,reason})=>`${relay}: ${reason}`).join("; ")}`:"";
  return `Public discovery verified on ${report.verified.length}/${total} relays.${suffix}`;
}
