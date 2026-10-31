import type {DatabaseSync} from "node:sqlite";
import type {IdleCommand} from "../guide/idle-contract";

export class IdleReminderPreferences{
 constructor(readonly db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS guide_idle_preference(city TEXT NOT NULL,owner TEXT NOT NULL,enabled INTEGER NOT NULL,snooze INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(city,owner))`);}
 read(city:string,owner:string){const row=this.db.prepare("SELECT enabled,snooze,version FROM guide_idle_preference WHERE city=? AND owner=?").get(city,owner) as {enabled:number;snooze:number;version:number}|undefined;return {enabled:row?Boolean(row.enabled):true,snooze:row?.snooze??0,version:row?.version??0};}
 save(city:string,owner:string,command:Extract<IdleCommand,{action:"save"}>,now:number){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   if(this.read(city,owner).version!==command.version)throw Error("Settings changed. Check again before saving.");
   this.db.prepare("INSERT INTO guide_idle_preference VALUES(?,?,?,?,?) ON CONFLICT(city,owner) DO UPDATE SET enabled=excluded.enabled,snooze=excluded.snooze,version=excluded.version").run(city,owner,command.choice==="off"?0:1,["30","90"].includes(command.choice)?now+Number(command.choice)*86400:0,command.version+1);
   this.db.exec("COMMIT");return this.read(city,owner);
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
}
