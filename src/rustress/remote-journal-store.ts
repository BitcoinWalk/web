import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {z} from "zod";

const hex=z.string().regex(/^[0-9a-f]{64}$/);
export const journalClaimSchema=z.object({serviceId:z.uuid(),binding:hex,fence:z.uuid(),id:z.uuid(),hash:hex,commitment:hex}).strict();
export type JournalClaim=z.infer<typeof journalClaimSchema>;
export const journalStateSchema=z.object({serviceId:z.uuid(),binding:hex,fence:z.uuid().nullable(),active:z.boolean(),lastSequence:z.number().int().safe().nonnegative()}).strict();
export type JournalState=z.infer<typeof journalStateSchema>;
export const journalEntrySchema=z.object({sequence:z.number().int().safe().positive(),id:z.uuid(),hash:hex,commitment:hex,fence:z.uuid()}).strict();
export const journalPageSchema=z.object({state:journalStateSchema,entries:z.array(journalEntrySchema).max(50)}).strict();
export const journalReceiptSchema=z.object({state:journalStateSchema,outcome:z.enum(["created","recorded"]),entry:journalEntrySchema}).strict();

/** One wallet binding per journal database. Caller provisions private storage.
 * No wallet credentials, signing, networking or deletion API. */
export class RemoteJournalStore {
 constructor(private db:DatabaseSync,binding:string){
  hex.parse(binding);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS remote_journal_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),service_id TEXT NOT NULL,binding TEXT NOT NULL,fence TEXT,active INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS remote_journal_entry(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,hash TEXT NOT NULL UNIQUE,commitment TEXT NOT NULL,fence TEXT NOT NULL);`);
  this.transaction(()=>{
   const row=db.prepare("SELECT binding FROM remote_journal_state WHERE singleton=1").get();
   if(row&&row.binding!==binding)throw new Error("Journal binding mismatch");
   if(!row)db.prepare("INSERT INTO remote_journal_state VALUES(1,?,?,NULL,0)").run(randomUUID(),binding);
   else db.prepare("UPDATE remote_journal_state SET active=0,fence=? WHERE singleton=1").run(randomUUID());
  });
 }
 private transaction<T>(run:()=>T){this.db.exec("BEGIN IMMEDIATE");try{const result=run();this.db.exec("COMMIT");return result;}catch(error){this.db.exec("ROLLBACK");throw error;}}
 state():JournalState{
  const r=this.db.prepare("SELECT * FROM remote_journal_state WHERE singleton=1").get()!;
  return {serviceId:String(r.service_id),binding:String(r.binding),fence:r.fence===null?null:String(r.fence),active:r.active===1,
   lastSequence:Number(this.db.prepare("SELECT COALESCE(MAX(sequence),0) AS last FROM remote_journal_entry").get()!.last)};
 }
 /** Separate operator authority. CAS prevents competing activations from
  * silently replacing each other. Activation requires externally stopped senders. */
 control(serviceId:string,expectedFence:string|null,action:"activate"|"pause"){
  z.uuid().parse(serviceId);z.uuid().nullable().parse(expectedFence);z.enum(["activate","pause"]).parse(action);
  return this.transaction(()=>{
   const state=this.state();if(state.serviceId!==serviceId||state.fence!==expectedFence)throw new Error("Journal control conflict");
   this.db.prepare("UPDATE remote_journal_state SET fence=?,active=? WHERE singleton=1").run(randomUUID(),action==="activate"?1:0);
   return this.state();
  });
 }
 claim(input:JournalClaim){
  const c=journalClaimSchema.parse(input);
  return this.transaction(()=>{
   const state=this.state();
   if(!state.active||c.serviceId!==state.serviceId||c.binding!==state.binding||c.fence!==state.fence)throw new Error("Journal claim denied");
   const old=this.db.prepare("SELECT * FROM remote_journal_entry WHERE id=? OR hash=?").get(c.id,c.hash);
   if(old){
    if(old.id!==c.id||old.hash!==c.hash||old.commitment!==c.commitment)throw new Error("Journal claim conflict");
    return {state,outcome:"recorded" as const,entry:journalEntrySchema.parse(old)};
   }
   this.db.prepare("INSERT INTO remote_journal_entry(id,hash,commitment,fence) VALUES(?,?,?,?)").run(c.id,c.hash,c.commitment,c.fence);
   return {state:this.state(),outcome:"created" as const,entry:journalEntrySchema.parse(this.db.prepare("SELECT * FROM remote_journal_entry WHERE id=?").get(c.id))};
  });
 }
 page(after=0){
  z.number().int().safe().nonnegative().parse(after);
  return this.transaction(()=>({state:this.state(),entries:this.db.prepare("SELECT * FROM remote_journal_entry WHERE sequence>? ORDER BY sequence LIMIT 50").all(after).map(row=>journalEntrySchema.parse(row))}));
 }
}
