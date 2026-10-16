import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";

const hex=z.string().regex(/^[0-9a-f]{64}$/),uuid=z.uuid();
export const SPONSOR_HOST_BASIS_POINTS=7900,SPONSOR_RETAINED_BASIS_POINTS=2100;
const recordSchema=z.object({id:uuid,cityId:uuid,cityName:z.string().min(1).max(100),walkId:hex.nullable(),walkLabel:z.string().min(1).max(300).nullable(),hostPubkey:hex,payoutVersion:z.number().int().positive(),createdAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),revokedAt:z.number().int().nonnegative().nullable(),revokedBy:hex.nullable()}).strict();
export type SponsorHostInvitation=z.infer<typeof recordSchema>;
type Row=SponsorHostInvitation&{tokenHash:string;authorizationEvent:string;revocationEvent:string|null};
const hash=(token:string)=>createHash("sha256").update(token).digest("hex");

/** Durable capability registry. Raw invitation tokens are returned to the host
 * once and never stored; the signed authorization is retained for audit. */
export class SponsorInvitationStore{
 constructor(readonly db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS sponsorship_invitation(
   id TEXT PRIMARY KEY,tokenHash TEXT NOT NULL UNIQUE,cityId TEXT NOT NULL,cityName TEXT NOT NULL,hostPubkey TEXT NOT NULL,payoutVersion INTEGER NOT NULL,
   createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,revokedAt INTEGER,authorizationEvent TEXT NOT NULL);`);
  const columns=db.prepare("PRAGMA table_info(sponsorship_invitation)").all() as {name:string}[];
  if(!columns.some(column=>column.name==="walkId"))db.exec("ALTER TABLE sponsorship_invitation ADD COLUMN walkId TEXT");
  if(!columns.some(column=>column.name==="walkLabel"))db.exec("ALTER TABLE sponsorship_invitation ADD COLUMN walkLabel TEXT");
  if(!columns.some(column=>column.name==="revokedBy"))db.exec("ALTER TABLE sponsorship_invitation ADD COLUMN revokedBy TEXT");
  if(!columns.some(column=>column.name==="revocationEvent"))db.exec("ALTER TABLE sponsorship_invitation ADD COLUMN revocationEvent TEXT");
 }
 create(input:{id:string;token:string;cityId:string;cityName:string;walkId?:string|null;walkLabel?:string|null;hostPubkey:string;payoutVersion:number;expiresAt:number;authorizationEvent:string}){
  const time=this.now();if(!/^[a-f0-9]{64}$/.test(input.token))throw new Error("Invalid sponsor invitation token.");
  const value=recordSchema.parse({id:input.id,cityId:input.cityId,cityName:input.cityName,walkId:input.walkId??null,walkLabel:input.walkLabel??null,hostPubkey:input.hostPubkey,payoutVersion:input.payoutVersion,createdAt:time,expiresAt:input.expiresAt,revokedAt:null,revokedBy:null});
  if((value.walkId===null)!==(value.walkLabel===null))throw new Error("Sponsor invitation walk scope is incomplete.");
  if(value.expiresAt<time+3600||value.expiresAt>time+30*86400)throw new Error("Sponsor invitation expiry must be between one hour and 30 days.");
  const old=this.db.prepare("SELECT * FROM sponsorship_invitation WHERE id=?").get(value.id) as Row|undefined,tokenHash=hash(input.token),document=input.authorizationEvent;
  if(old){if(old.tokenHash!==tokenHash||old.cityId!==value.cityId||old.walkId!==value.walkId||old.walkLabel!==value.walkLabel||old.hostPubkey!==value.hostPubkey||old.payoutVersion!==value.payoutVersion||old.expiresAt!==value.expiresAt||old.authorizationEvent!==document)throw new Error("Sponsor invitation conflict.");return this.view(old);}
  this.db.prepare("INSERT INTO sponsorship_invitation(id,tokenHash,cityId,cityName,hostPubkey,payoutVersion,createdAt,expiresAt,revokedAt,authorizationEvent,walkId,walkLabel,revokedBy,revocationEvent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(value.id,tokenHash,value.cityId,value.cityName,value.hostPubkey,value.payoutVersion,value.createdAt,value.expiresAt,null,document,value.walkId,value.walkLabel,null,null);
  return value;
 }
 private view(row:Row):SponsorHostInvitation{const {tokenHash,authorizationEvent,revocationEvent,...safe}=row;void tokenHash;void authorizationEvent;void revocationEvent;return recordSchema.parse(safe);}
 list(hostPubkey:string){hex.parse(hostPubkey);return (this.db.prepare("SELECT * FROM sponsorship_invitation WHERE hostPubkey=? ORDER BY createdAt DESC,id DESC").all(hostPubkey) as Row[]).map(row=>this.view(row));}
 listAll(){return (this.db.prepare("SELECT * FROM sponsorship_invitation ORDER BY createdAt DESC,id DESC").all() as Row[]).map(row=>this.view(row));}
 resolve(token:string,cityId?:string){if(!/^[a-f0-9]{64}$/.test(token))return null;const row=this.db.prepare("SELECT * FROM sponsorship_invitation WHERE tokenHash=?").get(hash(token)) as Row|undefined;if(!row||row.revokedAt!==null||row.expiresAt<=this.now()||cityId&&row.cityId!==cityId)return null;return this.view(row);}
 revoke(id:string,actor:string,revocationEvent="legacy-test",adminOverride=false){uuid.parse(id);hex.parse(actor);const row=this.db.prepare("SELECT * FROM sponsorship_invitation WHERE id=?").get(id) as Row|undefined;if(!row||!adminOverride&&row.hostPubkey!==actor)throw new Error("Sponsor invitation not found.");if(row.revokedAt===null)this.db.prepare("UPDATE sponsorship_invitation SET revokedAt=?,revokedBy=?,revocationEvent=? WHERE id=?").run(this.now(),actor,revocationEvent,id);return this.view(this.db.prepare("SELECT * FROM sponsorship_invitation WHERE id=?").get(id) as Row);}
}
