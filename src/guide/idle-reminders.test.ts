import {afterEach,describe,expect,it} from "vitest";
import {generateSecretKey,getPublicKey} from "nostr-tools";
import {Outbox} from "./outbox";
import {IdleReminders} from "./idle-reminders";
import type {IdleSnapshot} from "./idle-contract";

const DAY=86400,secret=generateSecretKey(),owner=getPublicKey(generateSecretKey()),other=getPublicKey(generateSecretKey());
const city={cityId:"10000000-0000-4000-8000-000000000001",cityName:"Bangkok",recipient:owner,empty:true,allowed:true,preferenceVersion:0};
const boxes:Outbox[]=[];
function setup(){const box=new Outbox(":memory:");boxes.push(box);return {box,engine:new IdleReminders(box)};}
function snapshot(day:number,changes:Partial<IdleSnapshot>={}):IdleSnapshot{return {version:1,checkedAt:day*DAY,paused:false,cities:[city],...changes};}
function advance(engine:IdleReminders,from:number,to:number,changes:Partial<IdleSnapshot>={}){for(let day=from;day<=to;day++)engine.reconcile(snapshot(day,changes),day*DAY);}
function queue(engine:IdleReminders,day:number,changes:Partial<IdleSnapshot>={}){return engine.queue(snapshot(day,changes),secret,"https://bitcoinwalk.org/admin",day*DAY,[owner,other]);}
afterEach(()=>{for(const box of boxes.splice(0))box.close();});
describe("bounded idle reminders",()=>{
 it("waits seven observed days, follows up fourteen days after acknowledgement, then stops",()=>{
  const {box,engine}=setup();advance(engine,1,7);expect(queue(engine,7)).toBe(0);expect(queue(engine,8)).toBe(1);
  engine.acknowledge(box.due(8*DAY)[0],8*DAY);advance(engine,9,21);expect(queue(engine,21)).toBe(0);expect(queue(engine,22)).toBe(1);
  engine.acknowledge(box.due(22*DAY)[0],22*DAY);advance(engine,23,60);expect(queue(engine,60)).toBe(0);
 });
 it("groups cities, preserves exact envelopes over retries and restarts, and deduplicates scans",()=>{
  const {box,engine}=setup(),changes={cities:[city,{...city,cityId:"20000000-0000-4000-8000-000000000002",cityName:"London"}]};
  advance(engine,1,8,changes);expect(queue(engine,8,changes)).toBe(1);const row=box.due(8*DAY)[0];box.retry(row,8*DAY);
  const restarted=new IdleReminders(box);expect(queue(restarted,8,changes)).toBe(0);expect(box.due(8*DAY+60)[0].wrapped).toBe(row.wrapped);
  restarted.acknowledge(row,8*DAY);expect(box.db.prepare("SELECT stage FROM idle_period").all()).toEqual([{stage:1},{stage:1}]);
 });
 it.each(["scheduled","owner","snooze","version","removed","paused"])("cancels pending work when %s changes",reason=>{
  const {box,engine}=setup();advance(engine,1,8);queue(engine,8);const row=box.due(8*DAY)[0];
  const changed=snapshot(8,{paused:reason==="paused",cities:reason==="removed"?[]:[{...city,empty:reason!=="scheduled",recipient:reason==="owner"?other:owner,allowed:reason!=="snooze",preferenceVersion:reason==="version"?1:0}]});
  engine.reconcile(changed,8*DAY);expect(engine.current(row,changed,8*DAY)).toBe(false);expect(box.due(8*DAY)).toHaveLength(0);
 });
 it("resets observation after an unavailable or missed scan without losing a pending envelope",()=>{
  const {box,engine}=setup();advance(engine,1,8);queue(engine,8);const row=box.due(8*DAY)[0];engine.unavailable();
  engine.reconcile(snapshot(9),9*DAY);expect(engine.current(row,snapshot(9),9*DAY)).toBe(false);advance(engine,10,16);
  expect(engine.current(row,snapshot(16),16*DAY)).toBe(true);expect(box.due(16*DAY)[0].wrapped).toBe(row.wrapped);expect(queue(engine,16)).toBe(0);
 });
 it("does not count a long outage as seven idle days",()=>{const {engine}=setup();advance(engine,1,2);expect(queue(engine,12)).toBe(0);advance(engine,13,19);expect(queue(engine,19)).toBe(1);});
 it("retains the cap through snoozes and resets it only when a walk was scheduled",()=>{
  const {box,engine}=setup();advance(engine,1,8);queue(engine,8);engine.acknowledge(box.due(8*DAY)[0],8*DAY);
  advance(engine,9,22);queue(engine,22);engine.acknowledge(box.due(22*DAY)[0],22*DAY);
  advance(engine,23,30,{cities:[{...city,allowed:false}]});advance(engine,31,40);expect(queue(engine,40)).toBe(0);
  engine.reconcile(snapshot(41,{cities:[{...city,empty:false}]}),41*DAY);advance(engine,42,49);expect(queue(engine,49)).toBe(1);
 });
 it("enforces recipient cooldown across new cities",()=>{
  const {box,engine}=setup();advance(engine,1,8);queue(engine,8);engine.acknowledge(box.due(8*DAY)[0],8*DAY);
  const changes={cities:[city,{...city,cityId:"20000000-0000-4000-8000-000000000002"}]};advance(engine,9,16,changes);expect(queue(engine,16,changes)).toBe(0);advance(engine,17,22,changes);expect(queue(engine,22,changes)).toBe(1);
 });
 it("refuses stale, duplicate-city snapshots, disabled sending and recipients outside the pilot",()=>{
  const {engine}=setup();expect(()=>engine.reconcile(snapshot(1),3*DAY)).toThrow();expect(()=>engine.reconcile(snapshot(1,{cities:[city,city]}),DAY)).toThrow();
  advance(engine,1,8);expect(engine.queue(snapshot(8),secret,"https://bitcoinwalk.org/admin",8*DAY,[])).toBe(0);expect(queue(engine,8,{paused:true})).toBe(0);
 });
 it("counts uncertain deliveries against the cap even if a preference change cancels them",()=>{
  const {engine}=setup();advance(engine,1,8);queue(engine,8);
  const changed={cities:[{...city,preferenceVersion:1}]};advance(engine,9,22,changed);expect(queue(engine,22,changed)).toBe(1);
  const again={cities:[{...city,preferenceVersion:2}]};advance(engine,23,45,again);expect(queue(engine,45,again)).toBe(0);
 });
});
