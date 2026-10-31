import {randomUUID} from "node:crypto";
import type {Outbox,Delivery} from "./outbox";
import {wrapAlert} from "./core";
import {idleSnapshotSchema,type IdleSnapshot} from "./idle-contract";

const DAY=86400;
type Period={city:string;recipient:string;period:string;first:number;last:number;stage:number;due:number};
type Member={city:string;period:string;version:number};
export class IdleReminders{
 constructor(readonly outbox:Outbox){outbox.db.exec(`
  CREATE TABLE IF NOT EXISTS idle_period(city TEXT PRIMARY KEY,recipient TEXT NOT NULL,period TEXT NOT NULL,first INTEGER NOT NULL,last INTEGER NOT NULL,stage INTEGER NOT NULL,due INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS idle_batch(submission TEXT PRIMARY KEY,members TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS idle_cooldown(recipient TEXT PRIMARY KEY,until INTEGER NOT NULL);
 `);}
 private periods(){return this.outbox.db.prepare("SELECT * FROM idle_period").all() as Period[];}
 private pending(){return this.outbox.db.prepare("SELECT * FROM delivery WHERE purpose='idle-reminder' AND state='pending'").all() as Delivery[];}
 private members(submission:string):Member[]{const row=this.outbox.db.prepare("SELECT members FROM idle_batch WHERE submission=?").get(submission) as {members:string}|undefined;return row?JSON.parse(row.members):[];}
 /** An outage cannot count as observed inactivity; retain the two-message cap. */
 unavailable(){this.outbox.db.prepare("UPDATE idle_period SET last=0").run();}
 reconcile(input:IdleSnapshot,now:number){
  const snapshot=idleSnapshotSchema.parse(input);
  if(Math.abs(snapshot.checkedAt-now)>60||new Set(snapshot.cities.map(city=>city.cityId)).size!==snapshot.cities.length)throw Error("Snapshot is stale or ambiguous.");
  const db=this.outbox.db;db.exec("BEGIN IMMEDIATE");
  try{
   const current=new Map(snapshot.cities.map(city=>[city.cityId,city]));
   for(const period of this.periods()){
    const city=current.get(period.city);
    if(!city||city.recipient!==period.recipient||!city.empty)db.prepare("DELETE FROM idle_period WHERE city=?").run(period.city);
   }
   for(const city of snapshot.cities.filter(city=>city.empty)){
    const old=db.prepare("SELECT * FROM idle_period WHERE city=?").get(city.cityId) as Period|undefined;
    if(!old){db.prepare("INSERT INTO idle_period VALUES(?,?,?,?,?,?,?)").run(city.cityId,city.recipient,randomUUID(),now,now,0,now+7*DAY);continue;}
    // Allow daily scheduling jitter, but never infer inactivity across a missed day.
    const reset=!old.last||now-old.last>26*3600||now<old.last||!city.allowed||snapshot.paused;
    db.prepare("UPDATE idle_period SET first=?,last=?,due=? WHERE city=?").run(reset?now:old.first,now,reset?Math.max(old.due,now+7*DAY):old.due,city.cityId);
   }
   for(const row of this.pending())if(!this.current(row,snapshot,now,false))this.outbox.state(row,"obsolete");
   db.exec("COMMIT");return snapshot;
  }catch(error){db.exec("ROLLBACK");throw error;}
 }
 current(row:Delivery,snapshot:IdleSnapshot,now:number,requireDue=true){
  if(snapshot.paused||Math.abs(snapshot.checkedAt-now)>60)return false;
  const members=this.members(row.submission);
  return members.length>0&&members.every(member=>{
   const city=snapshot.cities.find(city=>city.cityId===member.city),period=this.outbox.db.prepare("SELECT * FROM idle_period WHERE city=?").get(member.city) as Period|undefined;
   return city?.recipient===row.recipient&&city.empty&&city.allowed&&city.preferenceVersion===member.version&&period?.period===member.period&&period.stage<=2&&(!requireDue||period.due<=now);
  });
 }
 queue(snapshot:IdleSnapshot,secret:Uint8Array,adminURL:string,now:number,allowlist:string[]){
  this.reconcile(snapshot,now);
  if(snapshot.paused)return 0;
  const db=this.outbox.db;db.exec("BEGIN IMMEDIATE");
  try{
   let count=0;
   const pending=new Set(this.pending().map(row=>row.recipient)),groups=new Map<string,Period[]>();
   for(const period of this.periods()){
    const city=snapshot.cities.find(city=>city.cityId===period.city),cooldown=db.prepare("SELECT until FROM idle_cooldown WHERE recipient=?").get(period.recipient) as {until:number}|undefined;
    if(!city?.allowed||period.stage>=2||period.due>now||pending.has(period.recipient)||(cooldown?.until??0)>now||!allowlist.includes(period.recipient))continue;
    const group=groups.get(period.recipient)??[];group.push(period);groups.set(period.recipient,group);
   }
   for(const [recipient,periods] of groups){
    const names=periods.map(period=>snapshot.cities.find(city=>city.cityId===period.city)!.cityName.replace(/[\r\n\t]/g," ")).sort();
    const text=`${periods.every(period=>period.stage===1)?"A final friendly reminder":"Hi"}! There aren't any upcoming walks listed for ${names.join(", ")} at the moment.\n\nReady to get your community walking again? Add your next walk: ${adminURL}/walks\n\nTaking a break is fine. Turn reminders off or snooze them for 30 or 90 days in My cities: ${adminURL}/my-cities\n\nWe send at most two reminders per idle period. BitcoinWalk Guide is automated; replies are not monitored.`;
    const wraps=wrapAlert(text,recipient,secret),submission=`idle:${randomUUID()}`;
    db.prepare("INSERT INTO delivery(submission,recipient,wrapped,sender_copy,purpose) VALUES(?,?,?,?,'idle-reminder')").run(submission,recipient,JSON.stringify(wraps.recipient),JSON.stringify(wraps.sender));
    db.prepare("INSERT INTO idle_batch VALUES(?,?)").run(submission,JSON.stringify(periods.map(period=>({city:period.city,period:period.period,version:snapshot.cities.find(city=>city.cityId===period.city)!.preferenceVersion}))));count++;
    // Reserve the budget before transport: an uncertain delivery may already have arrived.
    for(const period of periods)db.prepare("UPDATE idle_period SET stage=stage+1 WHERE city=? AND period=?").run(period.city,period.period);
    db.prepare("INSERT INTO idle_cooldown VALUES(?,?) ON CONFLICT(recipient) DO UPDATE SET until=MAX(until,excluded.until)").run(recipient,now+14*DAY);
   }
   db.exec("COMMIT");return count;
  }catch(error){db.exec("ROLLBACK");throw error;}
 }
 acknowledge(row:Delivery,now:number){
  const db=this.outbox.db;db.exec("BEGIN IMMEDIATE");
  try{
   if(this.pending().some(item=>item.submission===row.submission)){
    this.outbox.state(row,"acknowledged");
    for(const member of this.members(row.submission))db.prepare("UPDATE idle_period SET due=? WHERE city=? AND period=?").run(now+14*DAY,member.city,member.period);
    db.prepare("INSERT INTO idle_cooldown VALUES(?,?) ON CONFLICT(recipient) DO UPDATE SET until=MAX(until,excluded.until)").run(row.recipient,now+14*DAY);
   }
   db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
 }
}
