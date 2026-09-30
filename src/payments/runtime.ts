import {mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {PaymentService,PaymentStore} from "./service";
import {NwcWallet} from "./nwc";
import {verifyPurchasableCity} from "./cities";

type PaymentRuntime={service:PaymentService;store:PaymentStore;timer:NodeJS.Timeout};
const runtimeKey=Symbol.for("bitcoinwalk.payment-runtime");
type RuntimeGlobal=typeof globalThis&{[runtimeKey]?:PaymentRuntime};

function required(name:string):string{
 const value=process.env[name]?.trim();
 if(!value)throw new Error(`Missing ${name}`);
 return value;
}

function sourceRelay():string{
 const value=required("BITCOINWALK_SERVER_READ_RELAY"),url=new URL(value);
 if(!((url.protocol==="ws:"&&url.hostname==="127.0.0.1")||url.protocol==="wss:")||url.username||url.password||url.search||url.hash)throw new Error("Invalid server read relay");
 return url.href;
}

export function getPaymentRuntime():PaymentRuntime{
 const shared=globalThis as RuntimeGlobal;
 if(shared[runtimeKey])return shared[runtimeKey];
 const database=required("BITCOINWALK_PAYMENT_DATABASE");
 if(!database.startsWith("/var/lib/bitcoinwalk-app-staging/")&&process.env.NODE_ENV==="production")throw new Error("Application database must be inside the app state directory");
 mkdirSync(dirname(database),{recursive:true,mode:0o700});
 const store=new PaymentStore(database);
 const service=new PaymentService(store,new NwcWallet(required("BITCOINWALK_NWC_URL")),(city,revision)=>verifyPurchasableCity([sourceRelay()],city,revision));
 let busy=false;
 const reconcile=async()=>{if(busy)return;busy=true;try{await service.reconcile();}catch{console.warn("Payment reconciliation deferred; durable state was retained.");}finally{busy=false;}};
 const timer=setInterval(()=>void reconcile(),15_000);timer.unref();
 shared[runtimeKey]={service,store,timer};
 setTimeout(()=>void reconcile(),1_000).unref();
 return shared[runtimeKey];
}

export function startPaymentRuntime():void{
 try{getPaymentRuntime();console.log("BitcoinWalk app payment reconciliation ready.");}
 catch{console.warn("BitcoinWalk app payment reconciliation is not configured.");}
}

