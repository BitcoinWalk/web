import {beforeEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {acceptedWalkIds,queryHostedWalks} from "./hosted-walks";
import {delegationControl,delegationAcceptance,delegationState,queryDelegation} from "./delegations";
import {queryRelayEvents} from "./city-records";
import {resolveCalendarLink} from "./calendar-records";
vi.mock("./city-records",()=>({queryRelayEvents:vi.fn()}));
vi.mock("./calendar-records",()=>({resolveCalendarLink:vi.fn()}));
vi.mock("./delegations",async original=>({...await original<typeof import("./delegations")>(),queryDelegation:vi.fn()}));
vi.mock("../domain/event-routing",()=>({managedCalendarEvents:(_walk:unknown,events:unknown[])=>events.map(event=>({event,start:10000,status:"upcoming"}))}));
const creatorKey=new Uint8Array(32).fill(2),hostKey=new Uint8Array(32).fill(3),otherKey=new Uint8Array(32).fill(4);
const creator=getPublicKey(creatorKey),host=getPublicKey(hostKey),other=getPublicKey(otherKey);
const event=finalizeEvent({kind:31923,created_at:1,tags:[["i","66f137cb-2ac1-4eef-8358-7dd66b45922f"],["start","10000"],["end","13600"]],content:"walk"},creatorKey);
const invite=finalizeEvent(delegationControl(event,creator,host,"invite",undefined,100),creatorKey);
const pending=delegationState(event,[invite],101)!;
const acceptance=finalizeEvent(delegationAcceptance(pending,host,102),hostKey);
const active=delegationState(event,[invite,acceptance],103)!;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(queryRelayEvents).mockResolvedValue([acceptance]);vi.mocked(resolveCalendarLink).mockResolvedValue({event,walk:{} as never});vi.mocked(queryDelegation).mockResolvedValue(active);});
describe("delegate dashboard",()=>{
 it("discovers accepted hosting without any city-editor grant",async()=>{
  const result=await queryHostedWalks(["wss://example.com"],host);
  expect(result.map(h=>h.item.event.id)).toEqual([event.id]);
  expect(queryRelayEvents).toHaveBeenCalledWith(["wss://example.com"],[30306],undefined,{authors:[host],limit:200});
 });
 it("deduplicates history and ignores wrong identities, malformed and legacy records",()=>{
  const legacy=finalizeEvent({...acceptance,content:JSON.stringify({version:1,eventId:event.id})},hostKey);
  expect(acceptedWalkIds([acceptance,acceptance,legacy],host)).toEqual([event.id]);
  expect(acceptedWalkIds([acceptance],other)).toEqual([]);
 });
 it("removes revoked walks despite retained acceptance history",async()=>{
  const revoke=finalizeEvent(delegationControl(event,creator,host,"revoke",active,104),creatorKey);
  vi.mocked(queryDelegation).mockResolvedValue(delegationState(event,[invite,acceptance,revoke],105));
  expect(await queryHostedWalks(["wss://example.com"],host)).toEqual([]);
 });
 it("does not confuse a replacement host with the former nominee",async()=>{
  const replacement=finalizeEvent(delegationControl(event,creator,other,"invite",active,104),creatorKey);
  const next=delegationState(event,[replacement],105)!;
  const accepted=finalizeEvent(delegationAcceptance(next,other,106),otherKey);
  vi.mocked(queryDelegation).mockResolvedValue(delegationState(event,[replacement,accepted],107));
  expect(await queryHostedWalks(["wss://example.com"],host)).toEqual([]);
 });
 it("excludes cancelled/unpublished walks and pending invitations",async()=>{
  vi.mocked(resolveCalendarLink).mockResolvedValue(null);
  expect(await queryHostedWalks(["wss://example.com"],host)).toEqual([]);
  expect(queryDelegation).not.toHaveBeenCalled();
  vi.mocked(resolveCalendarLink).mockResolvedValue({event,walk:{} as never});vi.mocked(queryDelegation).mockResolvedValue(pending);
  expect(await queryHostedWalks(["wss://example.com"],host)).toEqual([]);
 });
 it("reports read failures and saturated discovery instead of a false empty list",async()=>{
  vi.mocked(queryDelegation).mockRejectedValue(new Error("relay offline"));
  await expect(queryHostedWalks(["wss://example.com"],host)).rejects.toThrow("relay offline");
  vi.mocked(queryRelayEvents).mockResolvedValue(Array(200).fill(acceptance));
  await expect(queryHostedWalks(["wss://example.com"],host)).rejects.toThrow("safe read limit");
 });
});
