import type {DatabaseSync} from "node:sqlite";
import {finalizeEvent,generateSecretKey,nip44,type Event} from "nostr-tools";
import {createRumor,createSeal,wrapEvent} from "nostr-tools/nip59";

export const PROCESSING_FAILED="Guide could not complete this question. Please try again later.";
type Transport={discover:(recipient:string)=>Promise<string[]>;publish:(event:Event,relays:string[])=>Promise<void>;now:()=>number};
type Row={message_id:string;recipient:string;reaction_id:string;wrapped:string;expires_at:number;removal:string|null;relays:string};

/** Only encrypted envelopes are retained, never the question text. */
export class GuideProcessingReactions{
 constructor(private db:DatabaseSync,private secret:Uint8Array,private transport:Transport){
  db.exec("CREATE TABLE IF NOT EXISTS guide_processing_reaction(message_id TEXT PRIMARY KEY,recipient TEXT NOT NULL,reaction_id TEXT NOT NULL,wrapped TEXT NOT NULL,expires_at INTEGER NOT NULL,removal TEXT,relays TEXT NOT NULL)");
 }
 async start(messageId:string,recipient:string,admit:()=>void=()=>{}){
  if(!/^[0-9a-f]{64}$/.test(messageId)||!/^[0-9a-f]{64}$/.test(recipient))throw new Error("Invalid processing target.");
  let row=this.db.prepare("SELECT * FROM guide_processing_reaction WHERE message_id=?").get(messageId) as Row|undefined;
  if(!row){
   const relays=await this.transport.discover(recipient);
   admit();
   if(!relays.length)throw new Error("No private reaction inbox.");
   const expires=this.transport.now()+300,expiration=["expiration",String(expires)];
   const rumor=createRumor({kind:7,created_at:this.transport.now(),tags:[["p",recipient],["e",messageId],["k","14"],expiration],content:"👀"},this.secret);
   const seal=finalizeEvent({...createSeal(rumor,this.secret,recipient),tags:[expiration]},this.secret),ephemeral=generateSecretKey();
   const wrapped=finalizeEvent({kind:1059,created_at:this.transport.now()-Math.floor(Math.random()*172800),tags:[["p",recipient],expiration],content:nip44.v2.encrypt(JSON.stringify(seal),nip44.v2.utils.getConversationKey(ephemeral,recipient))},ephemeral);
   ephemeral.fill(0);
   this.db.prepare("INSERT OR IGNORE INTO guide_processing_reaction VALUES (?,?,?,?,?,NULL,?)").run(messageId,recipient,rumor.id,JSON.stringify(wrapped),expires,JSON.stringify(relays));
   row=this.db.prepare("SELECT * FROM guide_processing_reaction WHERE message_id=?").get(messageId) as Row;
  }
  if(row.recipient!==recipient)throw new Error("Processing recipient changed.");
  admit();
  if(!row.removal&&row.expires_at>this.transport.now())await this.transport.publish(JSON.parse(row.wrapped),JSON.parse(row.relays));
 }
 async clear(messageId:string,failed:boolean){
  const row=this.db.prepare("SELECT * FROM guide_processing_reaction WHERE message_id=?").get(messageId) as Row|undefined;
  if(!row)return;
  const removal=row.removal??JSON.stringify(wrapEvent({kind:5,created_at:this.transport.now(),tags:[["p",row.recipient],["e",row.reaction_id],["k","7"]],content:failed?PROCESSING_FAILED:""},this.secret,row.recipient));
  this.db.prepare("UPDATE guide_processing_reaction SET removal=? WHERE message_id=?").run(removal,messageId);
  await this.transport.publish(JSON.parse(removal),JSON.parse(row.relays));
  this.db.prepare("DELETE FROM guide_processing_reaction WHERE message_id=?").run(messageId);
 }
 async retryCleanup(recipient:string){
  const rows=this.db.prepare("SELECT message_id FROM guide_processing_reaction WHERE recipient=? AND (removal IS NOT NULL OR expires_at<=?) LIMIT 5").all(recipient,this.transport.now()) as {message_id:string}[];
  for(const row of rows)await this.clear(row.message_id,true);
 }
}
