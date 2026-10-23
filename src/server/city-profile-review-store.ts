import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {authorizeProSetup} from "../nostr/pro-setup-command";

export type CityProfilePreview={fingerprint:string;pubkey:string;name:string;picture:string;website:string;eligible:boolean;accepted:boolean};
export function profileFingerprint(cityId:string,binding:string,pubkey:string,name:string,picture:string,website:string){
 return createHash("sha256").update(JSON.stringify(["city-profile-review-v1",cityId,binding,pubkey,name,picture,website])).digest("hex");
}
export function profileAccepted(db:DatabaseSync,cityId:string,fingerprint:string){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='city_profile_review'").get())return false;
 return !!db.prepare("SELECT 1 FROM city_profile_review WHERE city_id=? AND fingerprint=? AND actor=?").get(cityId,fingerprint,SUPER_ADMIN_PUBKEY);
}
/** Appearance approval only: cannot activate identity, membership or payments. */
export function saveProfileReview(db:DatabaseSync,event:Event,origin:string,current:CityProfilePreview,cityId:string){
 const command=authorizeProSetup(event,origin);
 if(event.pubkey!==SUPER_ADMIN_PUBKEY)throw new Error("Super-admin review required.");
 if(command.action!=="accept-city-profile"||command.cityId!==cityId||command.fingerprint!==current.fingerprint||!current.eligible)
  throw new Error("City identity preview changed or cannot be verified. Refresh before accepting.");
 db.exec("CREATE TABLE IF NOT EXISTS city_profile_review(city_id TEXT NOT NULL,fingerprint TEXT NOT NULL,actor TEXT NOT NULL,signed_event TEXT NOT NULL,accepted_at INTEGER NOT NULL,PRIMARY KEY(city_id,fingerprint))");
 db.prepare("INSERT OR IGNORE INTO city_profile_review VALUES(?,?,?,?,?)").run(cityId,current.fingerprint,event.pubkey,JSON.stringify(event),event.created_at);
}
