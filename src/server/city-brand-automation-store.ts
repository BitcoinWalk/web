import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import type {CityBrandAutomationPolicy} from "../nostr/city-brand-automation";

type State="planned"|"approved"|"published"|"blocked";
export class CityBrandAutomationStore{
 constructor(private db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS city_brand_automation_audit(
   request_id TEXT PRIMARY KEY,city_id TEXT NOT NULL,policy_id TEXT NOT NULL,event_id TEXT,
   state TEXT NOT NULL,detail TEXT NOT NULL,updated_at INTEGER NOT NULL);`);
 }
 plan(policyEvent:Event,policy:CityBrandAutomationPolicy,requestId:string,cityId:string){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const existing=this.db.prepare("SELECT * FROM city_brand_automation_audit WHERE request_id=?").get(requestId) as {city_id:string;policy_id:string}|undefined;
   if(existing){if(existing.city_id!==cityId||existing.policy_id!==policyEvent.id)throw new Error("Automation audit record conflicts with this request.");this.db.exec("COMMIT");return;}
   const used=(this.db.prepare("SELECT COUNT(DISTINCT city_id) total FROM city_brand_automation_audit WHERE policy_id=? AND state IN ('planned','approved','published')").get(policyEvent.id) as {total:number}).total;
   if(used>=policy.maximumCities)throw new Error("Automation policy city limit reached.");
   this.db.prepare("INSERT INTO city_brand_automation_audit(request_id,city_id,policy_id,state,detail,updated_at) VALUES(?,?,?,'planned','eligible',?)")
    .run(requestId,cityId,policyEvent.id,this.now());
   this.db.exec("COMMIT");
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
 record(requestId:string,state:State,detail:string,eventId?:string){
  if(!/^[\x20-\x7e]{1,200}$/.test(detail))throw new Error("Safe automation audit detail required.");
  const changed=this.db.prepare("UPDATE city_brand_automation_audit SET state=?,detail=?,event_id=COALESCE(?,event_id),updated_at=? WHERE request_id=?")
   .run(state,detail,eventId??null,this.now(),requestId);
  if(!changed.changes)throw new Error("Automation audit record not found.");
 }
 get(requestId:string){return this.db.prepare("SELECT state,detail FROM city_brand_automation_audit WHERE request_id=?").get(requestId) as {state:State;detail:string}|undefined;}
 rows(){return this.db.prepare("SELECT request_id requestId,city_id cityId,policy_id policyId,event_id eventId,state,detail,updated_at updatedAt FROM city_brand_automation_audit ORDER BY updated_at,request_id").all();}
}
