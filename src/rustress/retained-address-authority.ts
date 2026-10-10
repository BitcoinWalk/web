import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";

export const RETAINED_ADDRESS_AUTHORITY_API="bitcoinwalk-retained-address-authority-v1";
const label=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63),version=z.number().int().safe().positive();
export const retainedAddressConfigSchema=z.object({version,domain:z.literal("bitcoinwalk.org"),localPart:label,walletRef:label,
 receivingDestination:z.literal("bitcoinwalk@getalby.com"),invoiceIssuance:z.enum(["disabled","enabled"])}).strict();
export type RetainedAddressConfig=z.infer<typeof retainedAddressConfigSchema>;

export class RetainedAddressAuthorityStore{
 constructor(private db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS bw_retained_address_authority(
  domain TEXT NOT NULL COLLATE NOCASE,local_part TEXT NOT NULL COLLATE NOCASE,version INTEGER NOT NULL,
  config_hash TEXT NOT NULL,document TEXT NOT NULL,PRIMARY KEY(domain,local_part,version));`);}
 register(input:unknown){const config=retainedAddressConfigSchema.parse(input),document=JSON.stringify(config),hash=createHash("sha256").update(document).digest("hex");
  const old=this.db.prepare("SELECT config_hash,document FROM bw_retained_address_authority WHERE domain=? AND local_part=? AND version=?").get(config.domain,config.localPart,config.version) as {config_hash:string;document:string}|undefined;
  if(old){if(old.config_hash!==hash||old.document!==document)throw new Error("Retained address authority conflict");return{api:RETAINED_ADDRESS_AUTHORITY_API,state:"recorded" as const,domain:config.domain,localPart:config.localPart,addressVersion:config.version,configHash:hash};}
  this.db.prepare("INSERT INTO bw_retained_address_authority VALUES(?,?,?,?,?)").run(config.domain,config.localPart,config.version,hash,document);
  return{api:RETAINED_ADDRESS_AUTHORITY_API,state:"recorded" as const,domain:config.domain,localPart:config.localPart,addressVersion:config.version,configHash:hash};}
 resolveInvoice(domain:string,localPart:string,addressVersion:number){const row=this.db.prepare("SELECT document FROM bw_retained_address_authority WHERE domain=? AND local_part=? AND version=?").get(domain,localPart,addressVersion) as {document:string}|undefined;
  if(!row)return null;const config=retainedAddressConfigSchema.parse(JSON.parse(row.document));if(config.invoiceIssuance!=="enabled")return null;return{...config,invoiceIssuance:"enabled" as const};}
 count(){return Number((this.db.prepare("SELECT COUNT(*) count FROM bw_retained_address_authority").get() as {count:number}).count);}
}
