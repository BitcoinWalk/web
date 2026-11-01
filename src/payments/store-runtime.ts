import {mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {isApprovedPaymentDatabase} from "../lib/app-storage";
import {PaymentStore} from "./service";

const storeKey=Symbol.for("bitcoinwalk.payment-store");
type StoreGlobal=typeof globalThis&{[storeKey]?:PaymentStore};

export function getPaymentStore():PaymentStore{
 const shared=globalThis as StoreGlobal;
 if(shared[storeKey])return shared[storeKey];
 const database=process.env.BITCOINWALK_PAYMENT_DATABASE?.trim();
 if(!database)throw new Error("Missing BITCOINWALK_PAYMENT_DATABASE");
 if(process.env.NODE_ENV==="production"&&!isApprovedPaymentDatabase(database))throw new Error("Application database must be inside an approved app state directory");
 mkdirSync(dirname(database),{recursive:true,mode:0o700});
 return shared[storeKey]=new PaymentStore(database);
}
