import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event,EventTemplate} from "nostr-tools";
import {createCityDirectoryRotation,parseCityDirectoryEvent,verifySignedCityDirectorySuccessor} from "../nostr/city-directory";
import {verifyOwnershipTransferAcceptance,type OwnershipTransferAcceptance} from "../nostr/city-ownership-transfer";

export type OwnershipTransferStatus="awaiting-current-owner"|"awaiting-new-owner"|"ready"|"active"|"superseded"|"expired";
export type OwnershipTransferRequest={id:string;cityId:string;cityName:string;currentOwnerPubkey:string;nextOwnerPubkey:string;rootEventId:string;initialOwnerPubkey:string;predecessorEvent:Event;rotationTemplate:EventTemplate;rotationEvent:Event|null;acceptanceEvent:Event|null;retainEditors:boolean;status:OwnershipTransferStatus;createdAt:number;expiresAt:number;updatedAt:number};
type Row={id:string;cityId:string;cityName:string;currentOwnerPubkey:string;nextOwnerPubkey:string;rootEventId:string;initialOwnerPubkey:string;predecessorEvent:string;rotationTemplate:string;rotationEvent:string|null;acceptanceEvent:string|null;retainEditors:number;status:OwnershipTransferStatus;createdAt:number;expiresAt:number;updatedAt:number};
const view=(row:Row):OwnershipTransferRequest=>({...row,predecessorEvent:JSON.parse(row.predecessorEvent),rotationTemplate:JSON.parse(row.rotationTemplate),rotationEvent:row.rotationEvent?JSON.parse(row.rotationEvent):null,acceptanceEvent:row.acceptanceEvent?JSON.parse(row.acceptanceEvent):null,retainEditors:row.retainEditors===1});

export class OwnershipTransferStore{
 constructor(readonly db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS city_ownership_transfer(
   id TEXT PRIMARY KEY,cityId TEXT NOT NULL,cityName TEXT NOT NULL,currentOwnerPubkey TEXT NOT NULL,nextOwnerPubkey TEXT NOT NULL,
   rootEventId TEXT NOT NULL,initialOwnerPubkey TEXT NOT NULL,predecessorEvent TEXT NOT NULL,rotationTemplate TEXT NOT NULL,
   rotationEvent TEXT,acceptanceEvent TEXT,retainEditors INTEGER NOT NULL,status TEXT NOT NULL,createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
   CREATE UNIQUE INDEX IF NOT EXISTS city_ownership_transfer_active ON city_ownership_transfer(cityId) WHERE status IN ('awaiting-current-owner','awaiting-new-owner','ready');`);
 }
 private expire(){const now=this.now();this.db.prepare("UPDATE city_ownership_transfer SET status='expired',updatedAt=? WHERE status IN ('awaiting-current-owner','awaiting-new-owner') AND expiresAt<=?").run(now,now);}
 get(id:string){this.expire();const row=this.db.prepare("SELECT * FROM city_ownership_transfer WHERE id=?").get(id) as Row|undefined;return row?view(row):null;}
 list(actor:string,admin:string){this.expire();const rows=(actor===admin?this.db.prepare("SELECT * FROM city_ownership_transfer ORDER BY createdAt DESC").all():this.db.prepare("SELECT * FROM city_ownership_transfer WHERE currentOwnerPubkey=? OR nextOwnerPubkey=? ORDER BY createdAt DESC").all(actor,actor)) as Row[];return rows.map(view);}
 prepare(input:{cityId:string;cityName:string;currentOwnerPubkey:string;nextOwnerPubkey:string;rootEventId:string;initialOwnerPubkey:string;predecessorEvent:Event;retainEditors:boolean}){
  if(input.currentOwnerPubkey===input.nextOwnerPubkey)throw new Error("Choose a different destination owner.");
  if(this.db.prepare("SELECT 1 FROM city_ownership_transfer WHERE cityId=? AND status IN ('awaiting-current-owner','awaiting-new-owner','ready')").get(input.cityId))throw new Error("This city already has an active ownership transfer.");
  const now=this.now(),prior=parseCityDirectoryEvent(input.predecessorEvent);if(prior.cityId!==input.cityId||prior.ownerPubkey!==input.currentOwnerPubkey)throw new Error("Current directory ownership does not match this transfer.");
  const request:OwnershipTransferRequest={...input,id:randomUUID(),rotationTemplate:createCityDirectoryRotation(input.predecessorEvent,{signerPubkey:input.currentOwnerPubkey,nextOwnerPubkey:input.nextOwnerPubkey},Math.max(now,input.predecessorEvent.created_at+1)),rotationEvent:null,acceptanceEvent:null,status:"awaiting-current-owner",createdAt:now,expiresAt:now+7*86400,updatedAt:now};
  this.db.prepare("INSERT INTO city_ownership_transfer VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?)").run(request.id,request.cityId,request.cityName,request.currentOwnerPubkey,request.nextOwnerPubkey,request.rootEventId,request.initialOwnerPubkey,JSON.stringify(request.predecessorEvent),JSON.stringify(request.rotationTemplate),request.retainEditors?1:0,request.status,request.createdAt,request.expiresAt,request.updatedAt);
  return request;
 }
 signOwner(id:string,actor:string,event:Event){const row=this.get(id);if(!row||row.status!=="awaiting-current-owner"||actor!==row.currentOwnerPubkey)throw new Error("Only the verified current owner may sign this transfer.");const signed=verifySignedCityDirectorySuccessor(event,row.rotationTemplate,actor),now=this.now();this.db.prepare("UPDATE city_ownership_transfer SET rotationEvent=?,status='awaiting-new-owner',updatedAt=? WHERE id=?").run(JSON.stringify(signed),now,id);return this.get(id)!;}
 acceptance(id:string,origin:string):OwnershipTransferAcceptance{const row=this.get(id);if(!row?.rotationEvent||row.status!=="awaiting-new-owner")throw new Error("The current owner must sign before the new owner can accept.");return {version:1,requestId:id,origin,cityId:row.cityId,currentOwnerPubkey:row.currentOwnerPubkey,nextOwnerPubkey:row.nextOwnerPubkey,rotationEventId:row.rotationEvent.id,issuedAt:row.updatedAt,expiresAt:row.updatedAt+7*86400};}
 accept(id:string,origin:string,event:Event){const challenge=this.acceptance(id,origin);verifyOwnershipTransferAcceptance(event,challenge,this.now());const now=this.now();this.db.prepare("UPDATE city_ownership_transfer SET acceptanceEvent=?,status='ready',updatedAt=? WHERE id=?").run(JSON.stringify(event),now,id);return this.get(id)!;}
 activate(id:string){const row=this.get(id);if(!row||row.status!=="ready"||!row.rotationEvent||!row.acceptanceEvent)throw new Error("Both owners must sign before activation.");this.db.prepare("UPDATE city_ownership_transfer SET status='active',updatedAt=? WHERE id=?").run(this.now(),id);return this.get(id)!;}
 supersede(id:string){const row=this.get(id);if(!row||row.status==="active")throw new Error("Active ownership history cannot be superseded.");this.db.prepare("UPDATE city_ownership_transfer SET status='superseded',updatedAt=? WHERE id=?").run(this.now(),id);return this.get(id)!;}
}
