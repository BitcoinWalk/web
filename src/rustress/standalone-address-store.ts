import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {retainedAddressConfigSchema,type RetainedAddressConfig} from "./retained-address-authority";

type Row={domain:string;local_part:string;version:number;wallet_ref:string;receiving_destination:string;invoice_issuance:string;authority:string;evidence_hash:string;status:string};
export function initializeStandaloneAddressStore(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS rustress_standalone_address(
 domain TEXT NOT NULL COLLATE NOCASE,local_part TEXT PRIMARY KEY COLLATE NOCASE,version INTEGER NOT NULL,wallet_ref TEXT NOT NULL,
 receiving_destination TEXT NOT NULL,invoice_issuance TEXT NOT NULL CHECK(invoice_issuance IN ('disabled','enabled')),
 authority TEXT NOT NULL,evidence_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN ('active','revoked')),updated_at INTEGER NOT NULL);`);}
export function activeStandaloneAddress(db:DatabaseSync,localPart:string):RetainedAddressConfig|null{if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(localPart)||localPart.length>63)return null;
 const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rustress_standalone_address'").get();if(!table)return null;
 const row=db.prepare("SELECT domain,local_part,version,wallet_ref,receiving_destination,invoice_issuance,authority,evidence_hash,status FROM rustress_standalone_address WHERE local_part=? AND status='active'").get(localPart) as Row|undefined;
 if(!row||row.authority!=="bitcoinwalk-super-admin-v1")return null;try{return retainedAddressConfigSchema.parse({domain:row.domain,localPart:row.local_part,version:row.version,walletRef:row.wallet_ref,receivingDestination:row.receiving_destination,invoiceIssuance:row.invoice_issuance});}catch{return null;}}
export function installStandaloneAddress(db:DatabaseSync,input:unknown,now=Math.floor(Date.now()/1000)){const config=retainedAddressConfigSchema.parse(input),authority="bitcoinwalk-super-admin-v1",document=JSON.stringify(config),evidenceHash=createHash("sha256").update(`${authority}\n${document}`).digest("hex");initializeStandaloneAddressStore(db);
 const old=db.prepare("SELECT domain,local_part,version,wallet_ref,receiving_destination,invoice_issuance,authority,evidence_hash,status FROM rustress_standalone_address WHERE local_part=?").get(config.localPart) as Row|undefined;
 const exact=old?.domain===config.domain&&old.local_part===config.localPart&&old.version===config.version&&old.wallet_ref===config.walletRef&&old.receiving_destination===config.receivingDestination&&old.invoice_issuance===config.invoiceIssuance&&old.authority===authority&&old.evidence_hash===evidenceHash&&old.status==="active";
 if(old&&!exact)throw new Error("Existing standalone address differs; no record changed.");
 if(!old)db.prepare("INSERT INTO rustress_standalone_address VALUES(?,?,?,?,?,?,?,?, 'active',?)").run(config.domain,config.localPart,config.version,config.walletRef,config.receivingDestination,config.invoiceIssuance,authority,evidenceHash,now);
 return{created:!old,address:activeStandaloneAddress(db,config.localPart),evidenceHash};}
