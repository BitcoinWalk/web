import {mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {PaymentService,PaymentStore} from "./service";
import {NwcWallet} from "./nwc";
import {verifyPurchasableCity} from "./cities";
import {SponsorService} from "./sponsor-service";
import {sponsorshipCatalog} from "./sponsor-catalog";
import {isApprovedPaymentDatabase} from "../lib/app-storage";

type PaymentRuntime={service:PaymentService;sponsors:SponsorService;store:PaymentStore;timer:NodeJS.Timeout};
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
 if(process.env.NODE_ENV==="production"&&!isApprovedPaymentDatabase(database))throw new Error("Application database must be inside an approved app state directory");
 mkdirSync(dirname(database),{recursive:true,mode:0o700});
 const store=new PaymentStore(database);
 const wallet=new NwcWallet(required("BITCOINWALK_NWC_URL")),service=new PaymentService(store,wallet,(city,revision)=>verifyPurchasableCity([sourceRelay()],city,revision)),sponsors=new SponsorService(store.db,wallet,sponsorshipCatalog);
 let busy=false;
 const reconcile=async()=>{if(busy)return;busy=true;try{await service.reconcile();await sponsors.reconcile();}catch{console.warn("Payment reconciliation deferred; durable state was retained.");}finally{busy=false;}};
 const timer=setInterval(()=>void reconcile(),15_000);timer.unref();
 shared[runtimeKey]={service,sponsors,store,timer};
 setTimeout(()=>void reconcile(),1_000).unref();
 if(process.env.BITCOINWALK_MADEIRA_PILOT==="private-fixture-v1")void import("../server/madeira-pilot").then(module=>module.startMadeiraPilot()).catch(()=>console.warn("Private Madeira pilot unavailable; payments unchanged."));
 // Separate loop: slow/offline provisioning must never delay invoice settlement.
 if(process.env.BITCOINWALK_RUSTRESS_FIXTURE_ENABLED==="1"){
  let provisioningBusy=false;
  setInterval(()=>{if(provisioningBusy)return;provisioningBusy=true;void import("../server/rustress-workflow")
   .then(module=>module.reconcileIsolatedProvisioning()).catch(()=>console.warn("Isolated provisioning deferred; saved tasks retained."))
   .finally(()=>{provisioningBusy=false;});},30_000).unref();
 }
 if(process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED==="1"){
  let managedBusy=false;
  setInterval(()=>{if(managedBusy)return;managedBusy=true;void import("../server/rustress-activation")
   .then(module=>module.reconcileManagedProvisioning()).catch(()=>console.warn("Managed provisioning deferred; durable state was retained."))
   .finally(()=>{managedBusy=false;});},30_000).unref();
 }
 return shared[runtimeKey];
}

export function startPaymentRuntime():void{
 try{getPaymentRuntime();console.log("BitcoinWalk app payment reconciliation ready.");}
 catch{console.warn("BitcoinWalk app payment reconciliation is not configured.");}
}
