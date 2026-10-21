import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {getPublicKey,verifyEvent,type Event} from "nostr-tools";
import {wrapAlert} from "./core";
import type {GuideProSetupTask} from "./pro-setup";

export const hannoverCityId="d42123e1-1d01-473b-98e7-846342150eca";
export const hannoverMessage=`Hi Hannover! Your city name, logos, profile/avatar and NIP-05 are now verified.

Please finish setup here:
https://bitcoinwalk.org/admin/my-cities?city=d42123e1-1d01-473b-98e7-846342150eca#pro-city-services

Use your existing Hannover city identity—do not create a new one. Complete any missing payout confirmation, reconnect your city signer, confirm its recovery method, and submit the activation request.

BitcoinWalk will then review the city binding and complete Lightning activation. Never send anyone your private key or recovery backup.

BitcoinWalk Guide is automated; replies are not monitored.`;
export function hannoverRecipient(tasks:GuideProSetupTask[]):string{
 const rows=tasks.filter(row=>row.cityId===hannoverCityId&&row.kind==="setup");
 if(rows.length!==1||rows[0].kind!=="setup"||["active","complete","awaiting-review","awaiting-publication"].includes(rows[0].state))throw new Error("Hannover no longer has exactly one actionable host setup task; nothing sent.");
 return rows[0].ownerPubkey;
}
export function prepareHannoverDelivery(db:DatabaseSync,recipient:string,secret:Uint8Array){
 const bot=getPublicKey(secret),hash=createHash("sha256").update(hannoverMessage).digest("hex");
 db.exec("CREATE TABLE IF NOT EXISTS delivery (id INTEGER PRIMARY KEY CHECK(id=1),recipient TEXT NOT NULL,bot TEXT NOT NULL,message_hash TEXT NOT NULL,wrapped TEXT NOT NULL,sender_copy TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0)");
 db.exec("BEGIN IMMEDIATE");
 try{
  let row=db.prepare("SELECT * FROM delivery WHERE id=1").get() as {recipient:string;bot:string;message_hash:string;wrapped:string;acknowledged:number}|undefined;
  if(!row){const wraps=wrapAlert(hannoverMessage,recipient,secret);db.prepare("INSERT INTO delivery(id,recipient,bot,message_hash,wrapped,sender_copy) VALUES(1,?,?,?,?,?)").run(recipient,bot,hash,JSON.stringify(wraps.recipient),JSON.stringify(wraps.sender));row=db.prepare("SELECT * FROM delivery WHERE id=1").get() as NonNullable<typeof row>;}
  if(row.recipient!==recipient||row.bot!==bot||row.message_hash!==hash)throw new Error("Stored delivery differs; refusing to create another message.");
  const event=JSON.parse(row.wrapped) as Event;
  if(!verifyEvent(event)||event.kind!==1059||event.tags.filter(t=>t[0]==="p").length!==1||!event.tags.some(t=>t[0]==="p"&&t[1]===recipient))throw new Error("Stored encrypted delivery is invalid.");
  db.exec("COMMIT");return {event,acknowledged:row.acknowledged===1};
 }catch(error){db.exec("ROLLBACK");throw error;}
}
