import { describe, it, expect } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import { unwrapEvent } from "nostr-tools/nip59";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, selectInbox, wrapAlert, approvalAlert, liveAlert, proSetupAlert, replicationAlert, assertBotKey, guideProfile, signTransportAuth } from "./core";
import { createInitialCalendarProposal } from "../nostr/calendar-event";
import { Outbox } from "./outbox";
import { type CityRevision, parseCityRevision, pendingCityRevisions } from "../nostr/city-records";
import {verifiedLivePublications} from "./live";

const bot = generateSecretKey(), admin = generateSecretKey(), organizer = generateSecretKey();
const recipient = getPublicKey(admin);
const city = { cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", slug: "memphis", cityName: "Memphis", requestedTier: "paid" as const,
  startAt: "2026-10-03T15:00:00Z", description: "A walk", meetingPoint: {description:"Square", latitude:35.1, longitude:-90.1}, heroImageUrl:"https://example.com/image.jpg" };
function revision(time = 100): CityRevision {
  const event = finalizeEvent({kind:30303, created_at:time, content:JSON.stringify(city), tags:[["d",city.cityId],["city",city.slug]]}, organizer);
  return { event, city };
}
function inbox(relays: string[], created_at = 100) {
  return finalizeEvent({kind:10050,created_at,content:"",tags:relays.map(r => ["relay",r])}, admin);
}
describe("BitcoinWalk Guide", () => {
  it("signs only transport authentication, never an approval or unapproved relay request", () => {
    const template = {kind:22242,created_at:Math.floor(Date.now()/1000),content:"",tags:[["relay","wss://relay.example.com/"],["challenge","test"]]};
    expect(signTransportAuth(template,bot,["wss://relay.example.com/"]).pubkey).toBe(getPublicKey(bot));
    expect(() => signTransportAuth({...template,kind:30304},bot,["wss://relay.example.com/"])).toThrow();
    expect(() => signTransportAuth(template,bot,[])).toThrow();
  });
  it("encrypts distinct recipient and sender copies with the same rumor", () => {
    const wraps = wrapAlert("Private alert", recipient, bot);
    expect(wraps.recipient.kind).toBe(1059);
    expect(wraps.recipient.content).not.toContain("Private alert");
    const decoded = unwrapEvent(wraps.recipient, admin);
    expect(decoded.pubkey).toBe(getPublicKey(bot)); expect(decoded.kind).toBe(14);
    expect(decoded.tags).toEqual([["p",recipient]]);
    expect(unwrapEvent(wraps.sender, bot).id).toBe(decoded.id);
    expect(() => unwrapEvent(wraps.recipient, generateSecretKey())).toThrow();
  });
  it("requires a verified current recipient inbox and operator-approved destination", () => {
    expect(selectInbox([inbox(["wss://relay.example.com"])], recipient, ["wss://relay.example.com/"])).toEqual(["wss://relay.example.com/"]);
    expect(() => selectInbox([],recipient,[])).toThrow();
    expect(() => selectInbox([inbox(["wss://relay.example.com"]),inbox(["wss://other.example.com"],101)],recipient,["wss://relay.example.com/"])).toThrow();
    expect(() => selectInbox([JSON.parse(JSON.stringify({...inbox(["wss://relay.example.com"]),sig:"0".repeat(128)}))],recipient,["wss://relay.example.com/"])).toThrow();
    expect(() => selectInbox([inbox(["ws://localhost:3335", "wss://127.0.0.1"])],recipient,[])).toThrow();
  });
  it("cannot use the recipient key and publishes the verified public identity", () => {
    expect(() => assertBotKey(admin,[recipient])).toThrow();
    expect(assertBotKey(bot,[recipient])).toBe(getPublicKey(bot));
    expect(guideProfile).toMatchObject({
      name:"BitcoinWalk Guide", display_name:"BitcoinWalk Guide", bot:true,
      picture:"https://bitcoinwalk.org/brand/bitcoinwalk-admin-favicon.png",
      nip05:"guide@bitcoinwalk.org", lud16:"guide@bitcoinwalk.org",
    });
  });
  it("links to an exact revision without treating a paid request as entitlement", () => {
    const item = revision();
    const content = approvalAlert(item,"https://app-staging.bitcoinwalk.org/admin");
    expect(content).toContain(`#submission-${item.event.id}`);
    expect(content).toContain("payment not verified");
    expect(content).not.toContain(city.heroImageUrl);
  });
  it("queues a verified-live message to the organizer separately from admin review alerts", () => {
    const item=revision(), event=finalizeEvent(createInitialCalendarProposal(city,"America/Chicago"),organizer);
    const approvalEvent=finalizeEvent({kind:30304,created_at:101,content:"",tags:[]},admin);
    const publication={revision:item,event,approval:{event:approvalEvent,approval:{cityId:city.cityId,cityRevisionId:item.event.id,initialEventId:event.id,status:"approved" as const}}};
    expect(liveAlert(item,event,"https://bitcoinwalk.org/admin","wss://relay.bitcoinwalk.org")).toContain("/memphis/nevent1");
    const box=new Outbox(":memory:");
    try {
      expect(box.ingestLive([],bot,"https://bitcoinwalk.org/admin","wss://relay.bitcoinwalk.org")).toBe(0);
      expect(box.ingestLive([publication],bot,"https://bitcoinwalk.org/admin","wss://relay.bitcoinwalk.org")).toBe(1);
      const row=box.due(0)[0];expect(row.purpose).toBe("live");expect(row.recipient).toBe(item.event.pubkey);
      expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).toContain("is live!");
      expect(box.ingestLive([publication],bot,"https://bitcoinwalk.org/admin","wss://relay.bitcoinwalk.org")).toBe(0);
    } finally {box.close();}
  });
  it("makes a delayed live notification obsolete after city revocation",()=>{
    const item=revision(),event=finalizeEvent(createInitialCalendarProposal(city,"America/Chicago"),organizer);
    const approved={event:finalizeEvent({kind:30304,created_at:101,content:"",tags:[]},admin),approval:{cityId:city.cityId,cityRevisionId:item.event.id,initialEventId:event.id,status:"approved" as const}};
    const revoked={event:finalizeEvent({kind:30304,created_at:102,content:"",tags:[]},admin),approval:{cityId:city.cityId,cityRevisionId:item.event.id,status:"revoked" as const}};
    expect(verifiedLivePublications([item],[approved],[event])).toHaveLength(1);
    expect(verifiedLivePublications([item],[approved,revoked],[event])).toEqual([]);
  });
  it("rejects arbitrary review-link hosts and insecure relay configuration", () => {
    const config = {sourceRelay:"wss://relay.bitcoinwalk.org",discoveryRelays:["wss://relay.example.com"],allowedInboxRelays:["wss://relay.example.com"],recipients:[recipient],adminURL:"https://app-staging.bitcoinwalk.org/admin"};
    expect(configSchema.parse(config).enabled).toBe(false);
    expect(configSchema.safeParse({...config,adminURL:"https://evil.example/admin"}).success).toBe(false);
    expect(configSchema.safeParse({...config,sourceRelay:"ws://127.0.0.1"}).success).toBe(false);
    expect(configSchema.safeParse({...config,sourceReadRelay:"ws://127.0.0.1:3334/"}).success).toBe(true);
    expect(configSchema.safeParse({...config,sourceReadRelay:"ws://127.0.0.1:3335/"}).success).toBe(false);
    expect(configSchema.safeParse({...config,sourceReadRelay:"ws://localhost:3334/"}).success).toBe(false);
  });
  it("validates accepted submissions using the same parser as the admin page", () => {
    expect(parseCityRevision(revision().event)?.city.cityId).toBe(city.cityId);
    expect(parseCityRevision({...revision().event,content:"tampered"})).toBeNull();
    expect(pendingCityRevisions([revision()], [{event:revision().event,approval:{cityId:city.cityId,cityRevisionId:revision().event.id,status:"rejected"}}])).toEqual([]);
  });
  it("baselines historical events, catches late timestamps and deduplicates across restart", () => {
    const dir = mkdtempSync(join(tmpdir(),"bitcoinwalk-guide-test-"));
    let box = new Outbox(join(dir,"queue.sqlite"));
    try {
      box.bind(getPublicKey(bot),"wss://relay.example.com/");
      const old = revision(100), late = revision(50);
      expect(box.ingest([old.event],[old],[recipient],bot,"https://bitcoinwalk.org/admin")).toBe(0);
      expect(box.ingest([old.event,late.event],[old,late],[recipient],bot,"https://bitcoinwalk.org/admin")).toBe(1);
      const row = box.due(0)[0]; const exact = row.wrapped;
      box.retry(row,1000); expect(box.due(1029)).toHaveLength(0);
      box.close(); box = new Outbox(join(dir,"queue.sqlite"));
      expect(box.due(1030)[0].wrapped).toBe(exact);
      expect(box.ingest([old.event,late.event],[old,late],[recipient],bot,"https://bitcoinwalk.org/admin")).toBe(0);
      box.state(box.due(1030)[0],"acknowledged"); expect(box.due(999999)).toEqual([]);
      expect(() => box.bind(getPublicKey(admin),"wss://relay.example.com/")).toThrow();
    } finally { box.close(); rmSync(dir,{recursive:true,force:true}); }
  });
  it("isolates delivery state for multiple notification recipients", () => {
    const box = new Outbox(":memory:");
    try {
      box.ingest([],[],[recipient],bot,"https://bitcoinwalk.org/admin");
      const second = getPublicKey(generateSecretKey()), item = revision();
      box.ingest([item.event],[item],[recipient,second],bot,"https://bitcoinwalk.org/admin");
      const rows = box.due(0); expect(rows).toHaveLength(2);
      box.state(rows[0],"obsolete"); expect(box.due(0)).toHaveLength(1);
    } finally { box.close(); }
  });
  it("baselines healthy replication and deduplicates degraded and recovery transitions across restart",()=>{
    const dir=mkdtempSync(join(tmpdir(),"bitcoinwalk-guide-replication-"));let box=new Outbox(join(dir,"queue.sqlite"));
    const healthy={cityId:city.cityId,destination:"wss://replica.example.com/",state:"healthy" as const,counts:{acknowledged:8,canceled:5}};
    const degraded={...healthy,state:"degraded" as const,counts:{retry:1}};
    try{
      expect(box.ingestReplication([healthy],new Map([[city.cityId,{recipient:getPublicKey(organizer),cityName:city.cityName}]]),bot)).toBe(0);
      expect(box.ingestReplication([degraded],new Map([[city.cityId,{recipient:getPublicKey(organizer),cityName:city.cityName}]]),bot)).toBe(1);
      let row=box.due(0)[0];expect(row.purpose).toBe("replication-degraded");const exact=row.wrapped;
      expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).toContain("replication is delayed");
      expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).not.toContain("retry");
      box.close();box=new Outbox(join(dir,"queue.sqlite"));
      expect(box.ingestReplication([degraded],new Map([[city.cityId,{recipient:getPublicKey(organizer),cityName:city.cityName}]]),bot)).toBe(0);
      expect(box.due(0)[0].wrapped).toBe(exact);box.state(box.due(0)[0],"acknowledged");
      expect(box.ingestReplication([healthy],new Map([[city.cityId,{recipient:getPublicKey(organizer),cityName:city.cityName}]]),bot)).toBe(1);
      row=box.due(0)[0];expect(row.purpose).toBe("replication-recovered");expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).toContain("replication has recovered");
    }finally{box.close();rmSync(dir,{recursive:true,force:true});}
  });
  it("keeps replication messages content-free",()=>{
    const text=replicationAlert("degraded",city.cityName,city.cityId);
    expect(text).toContain(city.cityName);expect(text).toContain(city.cityId);expect(text).not.toMatch(/[0-9a-f]{64}/);expect(text).not.toContain("wss://");
  });
  it("queues one private, resumable message for every Pro setup transition",()=>{const box=new Outbox(":memory:"),admin="https://bitcoinwalk.org/admin/my-cities",task={cityId:city.cityId,cityName:city.cityName,ownerPubkey:getPublicKey(organizer),kind:"setup" as const,state:"setup-required" as const,updatedAt:100};try{expect(proSetupAlert(city.cityName,city.cityId,task.state,admin)).toContain(`/admin/my-cities?city=${city.cityId}#pro-city-services`);expect(box.ingestProSetup([task],bot,admin)).toBe(1);let row=box.due(0)[0];expect(row.purpose).toBe("pro-setup-setup-required");const message=unwrapEvent(JSON.parse(row.wrapped),organizer).content;expect(message).toContain("confirm your payout destination");expect(message).toContain("Do not pay again");expect(message).not.toMatch(/[0-9a-f]{64}/);box.state(row,"acknowledged");expect(box.ingestProSetup([{...task,state:"payout-confirmed",updatedAt:101}],bot,admin)).toBe(1);row=box.due(0)[0];expect(row.purpose).toBe("pro-setup-payout-confirmed");expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).toContain("verified skip option");box.state(row,"acknowledged");expect(box.ingestProSetup([{...task,state:"payout-confirmed",updatedAt:102}],bot,admin)).toBe(0);}finally{box.close();}});
  it("guides organizer and BitcoinWalk waiting states without exposing evidence",()=>{const admin="https://bitcoinwalk.org/admin/my-cities",states=["signer-confirmed","ready-for-proof","awaiting-review","awaiting-publication","active"] as const,expected=["confirm your payout destination","sign the private activation request","No organizer action is needed now","No organizer action is needed now","publish the verified city profile"];for(const [index,state] of states.entries()){const message=proSetupAlert(city.cityName,city.cityId,state,admin);expect(message).toContain(expected[index]);expect(message).toContain("docs.bitcoinwalk.org/hosts/complete-city-setup/");expect(message).not.toMatch(/[0-9a-f]{64}/);}});
  it("isolates setup and payout-update transition memory",()=>{const box=new Outbox(":memory:"),admin="https://bitcoinwalk.org/admin/my-cities",base={cityId:city.cityId,cityName:city.cityName,ownerPubkey:getPublicKey(organizer),updatedAt:100};try{expect(box.ingestProSetup([{...base,kind:"setup",state:"setup-required"},{...base,kind:"payout-update",payoutVersion:2,state:"queued"}],bot,admin)).toBe(2);for(const row of box.due(0))box.state(row,"acknowledged");expect(box.ingestProSetup([{...base,kind:"setup",state:"setup-required"},{...base,kind:"payout-update",payoutVersion:2,state:"prepared"}],bot,admin)).toBe(0);}finally{box.close();}});
  it("baselines already active cities but notifies a tracked city when it becomes active",()=>{const box=new Outbox(":memory:"),admin="https://bitcoinwalk.org/admin/my-cities",base={cityId:city.cityId,cityName:city.cityName,ownerPubkey:getPublicKey(organizer),kind:"setup" as const,updatedAt:100};try{expect(box.ingestProSetup([{...base,state:"active"}],bot,admin)).toBe(0);expect(box.due(0)).toEqual([]);const second={...base,cityId:"b5c70f37-c558-42d6-85fa-f8881b2d6b73",state:"awaiting-publication" as const};expect(box.ingestProSetup([second],bot,admin)).toBe(1);box.state(box.due(0)[0],"acknowledged");expect(box.ingestProSetup([{...second,state:"active",updatedAt:101}],bot,admin)).toBe(1);expect(box.due(0)[0].purpose).toBe("pro-setup-active");}finally{box.close();}});
  it("notifies a replacement verified owner once without reusing the old envelope",()=>{const box=new Outbox(":memory:"),admin="https://bitcoinwalk.org/admin/my-cities",first={cityId:city.cityId,cityName:city.cityName,ownerPubkey:getPublicKey(organizer),kind:"setup" as const,state:"setup-required" as const,updatedAt:100},replacement=generateSecretKey();try{box.ingestProSetup([first],bot,admin);box.state(box.due(0)[0],"acknowledged");expect(box.ingestProSetup([{...first,ownerPubkey:getPublicKey(replacement),updatedAt:200}],bot,admin)).toBe(1);const row=box.due(0)[0];expect(row.recipient).toBe(getPublicKey(replacement));expect(unwrapEvent(JSON.parse(row.wrapped),replacement).content).toContain("Memphis");}finally{box.close();}});
  it("notifies grouped payout-update states without exposing its destination",()=>{const box=new Outbox(":memory:"),admin="https://bitcoinwalk.org/admin/my-cities",task={cityId:city.cityId,cityName:city.cityName,ownerPubkey:getPublicKey(organizer),kind:"payout-update" as const,payoutVersion:2,state:"queued" as const,updatedAt:100};try{expect(box.ingestProSetup([task],bot,admin)).toBe(1);let row=box.due(0)[0];expect(row.purpose).toBe("payout-update-pending");expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).toContain("previous destination remains active");box.state(row,"acknowledged");expect(box.ingestProSetup([{...task,state:"prepared",updatedAt:150}],bot,admin)).toBe(0);expect(box.ingestProSetup([{...task,state:"active",updatedAt:200}],bot,admin)).toBe(1);row=box.due(0)[0];expect(row.purpose).toBe("payout-update-active");const message=unwrapEvent(JSON.parse(row.wrapped),organizer).content;expect(message).toContain("is now active! ⚡");expect(message).toContain("there’s nothing else you need to do");expect(message).not.toContain("@example");}finally{box.close();}});
  it("baselines old directory requests and queues each later owner transition once",()=>{const box=new Outbox(":memory:"),id="b5c70f37-c558-42d6-85fa-f8881b2d6b73",base={id,cityId:city.cityId,cityName:"London",ownerPubkey:getPublicKey(organizer),status:"awaiting-owner" as const,createdAt:100,updatedAt:100,activationState:"not-requested" as const,activationUpdatedAt:null,activationFailure:null};try{expect(box.ingestDirectory([base],bot,"https://bitcoinwalk.org/admin")).toBe(0);const active={...base,status:"signed" as const,activationState:"active" as const,activationUpdatedAt:101};expect(box.ingestDirectory([active],bot,"https://bitcoinwalk.org/admin")).toBe(1);const row=box.due(0)[0];expect(row.purpose).toBe("directory-active");expect(unwrapEvent(JSON.parse(row.wrapped),organizer).content).toContain("directory entry for London is active");box.state(row,"acknowledged");expect(box.ingestDirectory([active],bot,"https://bitcoinwalk.org/admin")).toBe(0);}finally{box.close();}});
});
