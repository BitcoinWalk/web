import {describe,it,expect} from "vitest";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "./authority";
import {delegationControl,delegationAcceptance,delegationState,canDelegateWalk} from "./delegations";
const creatorKey=new Uint8Array(32).fill(2),nomineeKey=new Uint8Array(32).fill(3),otherKey=new Uint8Array(32).fill(4);
const creator=getPublicKey(creatorKey),nominee=getPublicKey(nomineeKey),other=getPublicKey(otherKey);
const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f";
const walk=finalizeEvent({kind:31923,created_at:1,tags:[["d","first"],["i",cityId],["start","10000"],["end","13600"]],content:"walk"},creatorKey);
const second=finalizeEvent({...walk,tags:[...walk.tags.filter(t=>t[0]!=="d"),["d","second"]]},creatorKey);
const invitation=()=>finalizeEvent(delegationControl(walk,creator,nominee,"invite",undefined,100),creatorKey);
describe("single-walk hosting delegation",()=>{
 it("requires acceptance and cannot leak onto another date in the same city",()=>{
  const invite=invitation(),pending=delegationState(walk,[invite],101)!;expect(pending.status).toBe("pending");
  const accept=finalizeEvent(delegationAcceptance(pending,nominee,102),nomineeKey);
  expect(delegationState(walk,[invite,accept],103)?.status).toBe("accepted");
  expect(delegationState(second,[invite,accept],103)).toBeUndefined();
  expect(delegationState(walk,[invite],13601)?.status).toBe("expired");
  expect(delegationState(walk,[invite,accept],13601)?.status).toBe("accepted"); // historical host, not city permission
 });
 it("allows author/admin only, not the accepted host",()=>{
  expect(canDelegateWalk(creator,walk)).toBe(true);expect(canDelegateWalk(SUPER_ADMIN_PUBKEY,walk)).toBe(true);
  expect(canDelegateWalk(nominee,walk)).toBe(false);
  expect(()=>delegationControl(walk,nominee,other,"invite",undefined,100)).toThrow("Only the walk author");
 });
 it("rejects the wrong identity, altered scope and old city-wide invitations",()=>{
  const invite=invitation(),pending=delegationState(walk,[invite],101)!;
  expect(()=>delegationAcceptance(pending,other,102)).toThrow("Select the Nostr identity");
  const wrong=finalizeEvent(delegationAcceptance(pending,nominee,102),otherKey);
  expect(delegationState(walk,[invite,wrong],103)?.status).toBe("pending");
  const legacy=finalizeEvent({...invite,content:JSON.stringify({...pending.control,version:1})},creatorKey);
  expect(delegationState(walk,[legacy],103)).toBeUndefined();
  const altered=finalizeEvent({...delegationAcceptance(pending,nominee,102),tags:[["d",invite.id],["i",cityId],["e",invite.id],["walk",second.id]]},nomineeKey);
  expect(delegationState(walk,[invite,altered],103)?.status).toBe("pending");
 });
 it("revokes hosting and requires fresh acceptance for a replacement",()=>{
  const invite=invitation(),pending=delegationState(walk,[invite],101)!;
  const accepted=finalizeEvent(delegationAcceptance(pending,nominee,102),nomineeKey);
  const active=delegationState(walk,[invite,accepted],103)!;
  const revoke=finalizeEvent(delegationControl(walk,creator,nominee,"revoke",active,104),creatorKey);
  const revoked=delegationState(walk,[invite,accepted,revoke],105)!;expect(revoked.status).toBe("revoked");
  const replacement=finalizeEvent(delegationControl(walk,creator,other,"invite",revoked,106),creatorKey);
  expect(delegationState(walk,[invite,accepted,revoke,replacement],107)?.status).toBe("pending");
 });
 it("caps the acceptance deadline at the event end and refuses stale or expired requests",()=>{
  const invite=invitation(),pending=delegationState(walk,[invite],101)!;
  expect(pending.control.expiresAt).toBe(13600);
  expect(()=>delegationControl(walk,creator,nominee,"revoke",pending,100)).toThrow("wait a second");
  expect(()=>delegationAcceptance(pending,nominee,13601)).toThrow("no longer available");
  expect(()=>delegationControl(walk,creator,nominee,"invite",undefined,13601)).toThrow("already ended");
  expect(()=>delegationControl(second,creator,nominee,"revoke",pending,104)).toThrow("Wrong walk");
 });
});
