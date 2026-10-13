import {mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {isApprovedPaymentDatabase} from "../lib/app-storage";
import {RelayProvisionStore} from "./store";

const runtimeKey=Symbol.for("bitcoinwalk.relay-provision-runtime");
type Shared=typeof globalThis&{[runtimeKey]?:{db:DatabaseSync;store:RelayProvisionStore}};

export function getRelayProvisionStore():RelayProvisionStore{
 const shared=globalThis as Shared;if(shared[runtimeKey])return shared[runtimeKey]!.store;
 const database=process.env.BITCOINWALK_PAYMENT_DATABASE?.trim();
 if(!database)throw new Error("Missing payment database");
 if(process.env.NODE_ENV==="production"&&!isApprovedPaymentDatabase(database))throw new Error("Invalid application database");
 mkdirSync(dirname(database),{recursive:true,mode:0o700});
 const db=new DatabaseSync(database),store=new RelayProvisionStore(db);shared[runtimeKey]={db,store};return store;
}

export function resetRelayProvisionRuntime(){const shared=globalThis as Shared;shared[runtimeKey]?.db.close();delete shared[runtimeKey];}
