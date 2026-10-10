import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {verifyCityActivation} from "./activation-contract";
import {managedProvisionConfigSchema} from "./contract";
import {activePublicIdentity} from "./public-identity-store";

const rowSchema=z.object({city:z.literal(MADEIRA_PILOT.cityId),request:z.uuid(),reserved_config:z.string(),activation_config:z.string(),proof:z.string().regex(/^[0-9a-f]{64}$/),
 public_origin:z.literal("https://bitcoinwalk.org"),phase:z.literal("active"),nip05:z.literal("active"),lnurl:z.literal("active"),lease:z.null(),until:z.literal(0),updated_at:z.number().int().safe().positive()}).strict();

/** Copies only the already verified public activation outbox row. Private
 * consent events, wallet credentials and provider tokens never enter the
 * production app database. */
export function importMadeiraProductionActivation(source:DatabaseSync,target:DatabaseSync){
 const row=rowSchema.parse(source.prepare("SELECT * FROM rustress_activation_task WHERE city=?").get(MADEIRA_PILOT.cityId));
 const reserved=managedProvisionConfigSchema.parse(JSON.parse(row.reserved_config)),activation=managedProvisionConfigSchema.parse(JSON.parse(row.activation_config));
 verifyCityActivation(reserved,activation);
 if(activation.cityId!==MADEIRA_PILOT.cityId||activation.localPart!=="madeira"||activation.domain!=="bitcoinwalk.org"||activation.brandPubkey!==MADEIRA_PILOT.pubkey||activation.invoiceIssuance!=="enabled")throw new Error("Invalid Madeira production activation");
 const identity=activePublicIdentity(target,"madeira");if(!identity||identity.brandPubkey!==activation.brandPubkey)throw new Error("Madeira public identity is not active");
 target.exec(`CREATE TABLE IF NOT EXISTS rustress_activation_task (
  city TEXT PRIMARY KEY,request TEXT NOT NULL UNIQUE,reserved_config TEXT NOT NULL,activation_config TEXT NOT NULL,
  proof TEXT NOT NULL,public_origin TEXT NOT NULL,phase TEXT NOT NULL,nip05 TEXT NOT NULL,lnurl TEXT NOT NULL,
  lease TEXT,until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);`);
 const existing=target.prepare("SELECT * FROM rustress_activation_task WHERE city=?").get(MADEIRA_PILOT.cityId);
 if(existing){if(JSON.stringify(existing)!==JSON.stringify(row))throw new Error("Existing Madeira activation differs");return {created:false};}
 target.prepare("INSERT INTO rustress_activation_task(city,request,reserved_config,activation_config,proof,public_origin,phase,nip05,lnurl,lease,until,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(row.city,row.request,row.reserved_config,row.activation_config,row.proof,row.public_origin,row.phase,row.nip05,row.lnurl,null,0,row.updated_at);
 return {created:true};
}
