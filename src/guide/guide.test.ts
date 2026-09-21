import { describe, it, expect } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import { unwrapEvent } from "nostr-tools/nip59";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, selectInbox, wrapAlert, approvalAlert, assertBotKey, guideProfile, signTransportAuth } from "./core";
import { Outbox } from "./outbox";
import { type CityRevision, parseCityRevision, pendingCityRevisions } from "../nostr/city-records";

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
  it("cannot use the recipient key as the bot and does not falsely claim NIP-05", () => {
    expect(() => assertBotKey(admin,[recipient])).toThrow();
    expect(assertBotKey(bot,[recipient])).toBe(getPublicKey(bot));
    expect(guideProfile.bot).toBe(true); expect(guideProfile).not.toHaveProperty("nip05");
  });
  it("links to an exact revision without treating a paid request as entitlement", () => {
    const item = revision();
    const content = approvalAlert(item,"https://app-staging.bitcoinwalk.org/admin");
    expect(content).toContain(`#submission-${item.event.id}`);
    expect(content).toContain("payment not verified");
    expect(content).not.toContain(city.heroImageUrl);
  });
  it("rejects arbitrary review-link hosts and insecure relay configuration", () => {
    const config = {sourceRelay:"wss://relay.bitcoinwalk.org",discoveryRelays:["wss://relay.example.com"],allowedInboxRelays:["wss://relay.example.com"],recipients:[recipient],adminURL:"https://app-staging.bitcoinwalk.org/admin"};
    expect(configSchema.parse(config).enabled).toBe(false);
    expect(configSchema.safeParse({...config,adminURL:"https://evil.example/admin"}).success).toBe(false);
    expect(configSchema.safeParse({...config,sourceRelay:"ws://127.0.0.1"}).success).toBe(false);
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
});
