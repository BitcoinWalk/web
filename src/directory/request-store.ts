import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {nip19,type Event,type EventTemplate} from "nostr-tools";
import {createCityDirectoryRoot,verifySignedCityDirectoryTemplate} from "../nostr/city-directory";

export type DirectoryRequestStatus="awaiting-owner"|"signed"|"rejected"|"superseded"|"expired";
export type DirectorySigningRequest={
 id:string;cityId:string;cityName:string;cityRevisionId:string;ownerPubkey:string;createdBy:string;
 primaryRelay:string;mirrorRelays:string[];operatorPubkeys:string[];status:DirectoryRequestStatus;
 eventCreatedAt:number;createdAt:number;expiresAt:number;updatedAt:number;recoveryPubkey:string|null;
 template:EventTemplate|null;signedEvent:Event|null;
};
type Row=Omit<DirectorySigningRequest,"mirrorRelays"|"operatorPubkeys"|"template"|"signedEvent">&{mirrorRelays:string;operatorPubkeys:string;template:string|null;signedEvent:string|null};

function decodeNpub(value:string):string{
 let decoded;
 try{decoded=nip19.decode(value.trim());}catch{throw new Error("Recovery identity must be a valid npub.");}
 if(decoded.type!=="npub"||typeof decoded.data!=="string")throw new Error("Recovery identity must be an npub, never an nsec or private key.");
 return decoded.data;
}
function view(row:Row):DirectorySigningRequest{return {...row,mirrorRelays:JSON.parse(row.mirrorRelays),operatorPubkeys:JSON.parse(row.operatorPubkeys),template:row.template?JSON.parse(row.template):null,signedEvent:row.signedEvent?JSON.parse(row.signedEvent):null};}

export class DirectoryRequestStore{
 constructor(readonly db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS city_directory_request(
   id TEXT PRIMARY KEY,cityId TEXT NOT NULL,cityName TEXT NOT NULL,cityRevisionId TEXT NOT NULL,ownerPubkey TEXT NOT NULL,createdBy TEXT NOT NULL,
   primaryRelay TEXT NOT NULL,mirrorRelays TEXT NOT NULL,operatorPubkeys TEXT NOT NULL,status TEXT NOT NULL,eventCreatedAt INTEGER NOT NULL,
   createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,recoveryPubkey TEXT,template TEXT,signedEvent TEXT);
   CREATE INDEX IF NOT EXISTS city_directory_request_owner ON city_directory_request(ownerPubkey,createdAt DESC);
   CREATE UNIQUE INDEX IF NOT EXISTS city_directory_request_active ON city_directory_request(cityId) WHERE status IN ('awaiting-owner','signed');`);
 }
 private expire(){const now=this.now();this.db.prepare("UPDATE city_directory_request SET status='expired',updatedAt=? WHERE status='awaiting-owner' AND expiresAt<=?").run(now,now);}
 get(id:string){this.expire();const row=this.db.prepare("SELECT * FROM city_directory_request WHERE id=?").get(id) as Row|undefined;return row?view(row):null;}
 list(actor:string,superAdmin:string){this.expire();const rows=(actor===superAdmin?this.db.prepare("SELECT * FROM city_directory_request ORDER BY createdAt DESC").all():this.db.prepare("SELECT * FROM city_directory_request WHERE ownerPubkey=? ORDER BY createdAt DESC").all(actor)) as Row[];return rows.map(view);}
 prepare(input:{cityId:string;cityName:string;cityRevisionId:string;ownerPubkey:string;createdBy:string;primaryRelay:string;mirrorRelays:string[];operatorPubkeys:string[];ttl?:number}){
  const now=this.now(),ttl=input.ttl??7*86400;if(ttl<300||ttl>30*86400)throw new Error("Directory request expiry is outside the allowed range.");
  if(input.ownerPubkey===input.createdBy&&input.operatorPubkeys.includes(input.ownerPubkey))throw new Error("The owner must not be duplicated as an operator.");
  const active=this.db.prepare("SELECT id FROM city_directory_request WHERE cityId=? AND status IN ('awaiting-owner','signed')").get(input.cityId) as {id:string}|undefined;
  if(active)throw new Error("This city already has an active directory request. Supersede it explicitly before preparing another.");
  const request:DirectorySigningRequest={...input,id:randomUUID(),status:"awaiting-owner",eventCreatedAt:now,createdAt:now,expiresAt:now+ttl,updatedAt:now,recoveryPubkey:null,template:null,signedEvent:null};
  this.db.prepare("INSERT INTO city_directory_request(id,cityId,cityName,cityRevisionId,ownerPubkey,createdBy,primaryRelay,mirrorRelays,operatorPubkeys,status,eventCreatedAt,createdAt,expiresAt,updatedAt,recoveryPubkey,template,signedEvent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(request.id,request.cityId,request.cityName,request.cityRevisionId,request.ownerPubkey,request.createdBy,request.primaryRelay,JSON.stringify(request.mirrorRelays),JSON.stringify(request.operatorPubkeys),request.status,request.eventCreatedAt,request.createdAt,request.expiresAt,request.updatedAt,null,null,null);
  return request;
 }
 sign(id:string,actor:string,recoveryNpub:string,event:Event){
  const request=this.get(id);if(!request)throw new Error("Directory request was not found.");
  if(request.ownerPubkey!==actor)throw new Error("Only the verified city owner may sign this request.");
  const recoveryPubkey=decodeNpub(recoveryNpub);
  if([request.ownerPubkey,...request.operatorPubkeys].includes(recoveryPubkey))throw new Error("Use a separate offline recovery identity, distinct from owner and operators.");
  const template=createCityDirectoryRoot({cityId:request.cityId,ownerPubkey:request.ownerPubkey,operatorPubkeys:request.operatorPubkeys,recoveryPubkey,primaryRelay:request.primaryRelay,mirrorRelays:request.mirrorRelays},request.eventCreatedAt);
  const signed=verifySignedCityDirectoryTemplate(event,template,actor);
  if(request.status==="signed"){
   if(request.signedEvent?.id!==signed.id)throw new Error("This request is already signed with a different immutable event.");
   return request;
  }
  if(request.status!=="awaiting-owner")throw new Error(`Directory request is ${request.status} and cannot be signed.`);
  const now=this.now();this.db.prepare("UPDATE city_directory_request SET status='signed',recoveryPubkey=?,template=?,signedEvent=?,updatedAt=? WHERE id=? AND status='awaiting-owner'").run(recoveryPubkey,JSON.stringify(template),JSON.stringify(signed),now,id);
  return this.get(id)!;
 }
 transition(id:string,actor:string,status:"rejected"|"superseded",superAdmin:string){
  const request=this.get(id);if(!request)throw new Error("Directory request was not found.");
  if(status==="rejected"&&actor!==request.ownerPubkey||status==="superseded"&&actor!==superAdmin)throw new Error("Directory request transition is not authorized.");
  if(request.status!=="awaiting-owner"&&request.status!=="signed")throw new Error(`Directory request is already ${request.status}.`);
  this.db.prepare("UPDATE city_directory_request SET status=?,updatedAt=? WHERE id=?").run(status,this.now(),id);return this.get(id)!;
 }
}
