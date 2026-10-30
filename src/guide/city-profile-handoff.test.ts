import {describe,it,expect} from "vitest";
import {generateSecretKey,getPublicKey} from "nostr-tools";
import {unwrapEvent} from "nostr-tools/nip59";
import {proSetupAlert} from "./core";
import {Outbox} from "./outbox";

describe("city profile Guide handoff",()=>{
 it("links directly to the exact city and explains public zap routing without leaking the private wallet",()=>{
  const message=proSetupAlert("Bangkok","d7d1cda8-7a58-42ad-ab60-c4bad61dab9a","active","https://bitcoinwalk.org/admin/my-cities");
  expect(message).toContain("https://bitcoinwalk.org/admin/profile?city=d7d1cda8-7a58-42ad-ab60-c4bad61dab9a#city-profile");
  expect(message).toContain("79% to your saved organizer payout wallet and 21% to BitcoinWalk");
  expect(message).toContain("bypass this split");
  expect(message).not.toContain("bighash@");
 });
 it("queues one profile prompt per city/recipient transition, then one final welcome",()=>{
  const box=new Outbox(":memory:"),bot=generateSecretKey(),owner=generateSecretKey(),admin="https://bitcoinwalk.org/admin/my-cities";
  const task={cityId:"d7d1cda8-7a58-42ad-ab60-c4bad61dab9a",cityName:"Bangkok",ownerPubkey:getPublicKey(owner),kind:"setup" as const,updatedAt:1};
  try{
   box.ingestProSetup([{...task,state:"awaiting-publication"}],bot,admin);
   expect(box.ingestProSetup([{...task,state:"active"}],bot,admin)).toBe(1);
   const prompt=box.due(0).find(row=>row.purpose==="pro-setup-active")!;
   expect(unwrapEvent(JSON.parse(prompt.wrapped),owner).content).toContain("/admin/profile?city=");
   expect(box.ingestProSetup([{...task,state:"active",updatedAt:2}],bot,admin)).toBe(0);
   expect(box.ingestProSetup([{...task,state:"complete",updatedAt:3}],bot,admin)).toBe(1);
   expect(box.ingestProSetup([{...task,state:"complete",updatedAt:4}],bot,admin)).toBe(0);
  }finally{box.close();}
 });
});
