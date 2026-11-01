import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import type {CityRevisionAutomationPolicy} from "../nostr/city-revision-automation-policy";

type State="planned"|"approved"|"published"|"blocked";
export class CityRevisionAutomationStore{
 constructor(private db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS city_revision_automation_audit(revision_id TEXT PRIMARY KEY,city_id TEXT NOT NULL,policy_id TEXT NOT NULL,event_id TEXT,signed_event TEXT,state TEXT NOT NULL,detail TEXT NOT NULL,updated_at INTEGER NOT NULL);`);
 }
 plan(policyEvent:Event,policy:CityRevisionAutomationPolicy,revisionId:string,cityId:string){
  this.db.exec("BEGIN IMMEDIATE");try{
   const existing=this.db.prepare("SELECT city_id cityId,policy_id policyId FROM city_revision_automation_audit WHERE revision_id=?").get(revisionId) as {cityId:string;policyId:string}|undefined;
   if(existing){if(existing.cityId!==cityId||existing.policyId!==policyEvent.id)throw new Error("Revision automation audit conflicts with this candidate.");this.db.exec("COMMIT");return;}
   const used=(this.db.prepare("SELECT COUNT(*) total FROM city_revision_automation_audit WHERE policy_id=? AND state IN ('planned','approved','published')").get(policyEvent.id) as {total:number}).total;
   if(used>=policy.maximumRevisions)throw new Error("Revision automation policy limit reached.");
   this.db.prepare("INSERT INTO city_revision_automation_audit VALUES(?,?,?,NULL,NULL,'planned','eligible',?)").run(revisionId,cityId,policyEvent.id,this.now());this.db.exec("COMMIT");
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
 approve(revisionId:string,event:Event){const result=this.db.prepare("UPDATE city_revision_automation_audit SET state='approved',detail='signed',event_id=?,signed_event=?,updated_at=? WHERE revision_id=? AND state IN ('planned','approved')").run(event.id,JSON.stringify(event),this.now(),revisionId);if(!result.changes)throw new Error("Revision automation audit is not signable.");}
 record(revisionId:string,state:State,detail:string,eventId?:string){if(!/^[\x20-\x7e]{1,200}$/.test(detail))throw new Error("Safe audit detail required.");const result=this.db.prepare("UPDATE city_revision_automation_audit SET state=?,detail=?,event_id=COALESCE(?,event_id),updated_at=? WHERE revision_id=?").run(state,detail,eventId??null,this.now(),revisionId);if(!result.changes)throw new Error("Revision automation audit not found.");}
 get(revisionId:string){const row=this.db.prepare("SELECT event_id eventId,signed_event signedEvent,state,detail FROM city_revision_automation_audit WHERE revision_id=?").get(revisionId) as {eventId:string|null;signedEvent:string|null;state:State;detail:string}|undefined;return row?{...row,signedEvent:row.signedEvent?JSON.parse(row.signedEvent) as Event:null}:undefined;}
}
