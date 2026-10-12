import type {DatabaseSync} from "node:sqlite";
import {getEventHash,verifyEvent,type Event} from "nostr-tools";
import {normalizePayoutDestination} from "../server/lnurl-pay";

export type ProductionEntitlementExpectation={
  cityId:string;owner:string;revisionId:string;invoiceId:string;amountMsat:number;
};

type InvoiceRow={id:string;cityId:string;owner:string;cityName:string;revisionId:string;invoice:string;paymentHash:string;
  amountMsat:number;createdAt:number;expiresAt:number;status:string;settledAt:number|null;checkedAt:number|null};
type EntitlementRow={cityId:string;owner:string;paymentHash:string;invoiceId:string;paidAt:number};
type InvoicePayoutRow={invoiceId:string;destinationVersion:number};
type RegistrationRow={city_id:string;revision_id:string;version:number;owner_pubkey:string;normalized:string;endpoint:string;callback:string;
  min_sendable:number;max_sendable:number;owner_event_id:string;owner_event:string;confirmed_at:number};
type SetupRow={cityId:string;entitlementId:string;originalOwnerPubkey:string;currentOwnerPubkey:string;registrationVersion:number|null;
  payoutVersion:number|null;brandPubkey:string|null;brandVersion:number;backupAcknowledgedAt:number|null;artworkRevisionId:string|null;
  artworkAvatar:string|null;artworkBanner:string|null;artworkVersion:number;state:string;createdAt:number;updatedAt:number};

const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const hex64=(value:string)=>/^[0-9a-f]{64}$/.test(value);
const invoiceColumns="id,cityId,owner,cityName,revisionId,invoice,paymentHash,amountMsat,createdAt,expiresAt,status,settledAt,checkedAt";
const entitlementColumns="cityId,owner,paymentHash,invoiceId,paidAt";
const registrationColumns="city_id,revision_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,owner_event_id,owner_event,confirmed_at";
const setupColumns="cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,registrationVersion,payoutVersion,brandPubkey,brandVersion,backupAcknowledgedAt,artworkRevisionId,artworkAvatar,artworkBanner,artworkVersion,state,createdAt,updatedAt";

function table(db:DatabaseSync,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type=? AND name=?").get("table",name);}
function exact<T>(db:DatabaseSync,sql:string,args:Array<string|number|null>):T|null{return (db.prepare(sql).get(...args) as T|undefined)??null;}

function sourceRows(source:DatabaseSync,expected:ProductionEntitlementExpectation){
  for(const name of ["payment_invoice","payment_invoice_payout","paid_city_entitlement","pro_setup_task","registration_payout_version"])
    if(!table(source,name))throw new Error(`Source is missing ${name}.`);
  const invoice=exact<InvoiceRow>(source,`SELECT ${invoiceColumns} FROM payment_invoice WHERE id=? AND cityId=?`,[expected.invoiceId,expected.cityId]);
  const entitlement=exact<EntitlementRow>(source,`SELECT ${entitlementColumns} FROM paid_city_entitlement WHERE cityId=?`,[expected.cityId]);
  const invoicePayout=exact<InvoicePayoutRow>(source,"SELECT * FROM payment_invoice_payout WHERE invoiceId=?",[expected.invoiceId]);
  const setup=exact<SetupRow>(source,`SELECT ${setupColumns} FROM pro_setup_task WHERE cityId=?`,[expected.cityId]);
  if(!invoice||!entitlement||!invoicePayout||!setup)throw new Error("Settled entitlement dependency is incomplete.");
  const registration=exact<RegistrationRow>(source,`SELECT ${registrationColumns} FROM registration_payout_version WHERE city_id=? AND version=?`,[expected.cityId,invoicePayout.destinationVersion]);
  if(!registration)throw new Error("Registration payout authority is unavailable.");
  if(invoice.cityId!==expected.cityId||invoice.owner!==expected.owner||invoice.revisionId!==expected.revisionId||invoice.amountMsat!==expected.amountMsat||
    invoice.status!=="paid"||!invoice.invoice||!hex64(invoice.paymentHash)||!Number.isSafeInteger(invoice.settledAt)||invoice.settledAt!<invoice.createdAt)
    throw new Error("Settled invoice differs from the reviewed city purchase.");
  if(entitlement.cityId!==expected.cityId||entitlement.owner!==expected.owner||entitlement.invoiceId!==expected.invoiceId||
    entitlement.paymentHash!==invoice.paymentHash||entitlement.paidAt!==invoice.settledAt)throw new Error("Paid entitlement differs from the settled invoice.");
  if(registration.city_id!==expected.cityId||registration.revision_id!==expected.revisionId||registration.version!==invoicePayout.destinationVersion||
    registration.owner_pubkey!==expected.owner||!registration.normalized||!registration.endpoint||!registration.callback||registration.min_sendable<1||
    registration.max_sendable<registration.min_sendable||!hex64(registration.owner_event_id))throw new Error("Registration payout authority differs from the reviewed purchase.");
  let event:Event,command:{action?:unknown;cityId?:unknown;revisionId?:unknown;payoutDestination?:unknown};
  try{event=JSON.parse(registration.owner_event);command=JSON.parse(event.content);}catch{throw new Error("Registration payout proof is invalid.");}
  if(event.id!==registration.owner_event_id||event.pubkey!==expected.owner||event.kind!==27235||getEventHash(event)!==event.id||!verifyEvent(event)||
    command.action!=="create"||command.cityId!==expected.cityId||command.revisionId!==expected.revisionId||
    typeof command.payoutDestination!=="string"||!command.payoutDestination)throw new Error("Registration payout proof does not authorize this purchase.");
  if(normalizePayoutDestination(command.payoutDestination).normalized!==registration.normalized)throw new Error("Registration payout proof does not match its private destination.");
  if(setup.cityId!==expected.cityId||setup.entitlementId!==expected.invoiceId||setup.originalOwnerPubkey!==expected.owner||setup.currentOwnerPubkey!==expected.owner||
    setup.registrationVersion!==registration.version||setup.payoutVersion!==null||setup.brandPubkey!==null||setup.brandVersion!==0||setup.backupAcknowledgedAt!==null||
    setup.artworkRevisionId!==null||setup.artworkAvatar!==null||setup.artworkBanner!==null||setup.artworkVersion!==0||setup.state!=="setup-required")
    throw new Error("Pro setup is no longer pristine; use the completed-setup migration path.");
  return {invoice,entitlement,invoicePayout,registration,setup};
}

export function importSettledCityEntitlement(source:DatabaseSync,target:DatabaseSync,expected:ProductionEntitlementExpectation,apply=false){
  const rows=sourceRows(source,expected);
  for(const name of ["payment_invoice","payment_invoice_payout","paid_city_entitlement","pro_setup_task","registration_payout_version"])
    if(!table(target,name))throw new Error(`Production is missing ${name}.`);
  const collision={
    invoice:exact<InvoiceRow>(target,`SELECT ${invoiceColumns} FROM payment_invoice WHERE id=? OR cityId=? OR paymentHash=?`,[expected.invoiceId,expected.cityId,rows.invoice.paymentHash]),
    entitlement:exact<EntitlementRow>(target,`SELECT ${entitlementColumns} FROM paid_city_entitlement WHERE cityId=? OR invoiceId=? OR paymentHash=?`,[expected.cityId,expected.invoiceId,rows.invoice.paymentHash]),
    invoicePayout:exact<InvoicePayoutRow>(target,"SELECT * FROM payment_invoice_payout WHERE invoiceId=?",[expected.invoiceId]),
    registration:exact<RegistrationRow>(target,`SELECT ${registrationColumns} FROM registration_payout_version WHERE city_id=? OR owner_event_id=?`,[expected.cityId,rows.registration.owner_event_id]),
    setup:exact<SetupRow>(target,`SELECT ${setupColumns} FROM pro_setup_task WHERE cityId=? OR entitlementId=?`,[expected.cityId,expected.invoiceId])};
  const found=Object.values(collision).filter(Boolean).length;
  if(found){
    if(found!==5||!same(collision.invoice,rows.invoice)||!same(collision.entitlement,rows.entitlement)||!same(collision.invoicePayout,rows.invoicePayout)||
      !same(collision.registration,rows.registration)||!same(collision.setup,rows.setup))throw new Error("Production contains conflicting city payment state.");
    return {created:false,cityId:expected.cityId,invoiceId:expected.invoiceId};
  }
  if(!apply)return {created:true,cityId:expected.cityId,invoiceId:expected.invoiceId};
  target.prepare(`INSERT INTO payment_invoice(${invoiceColumns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(rows.invoice));
  target.prepare(`INSERT INTO registration_payout_version(${registrationColumns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(rows.registration));
  target.prepare("INSERT INTO payment_invoice_payout VALUES(?,?)").run(rows.invoicePayout.invoiceId,rows.invoicePayout.destinationVersion);
  target.prepare(`INSERT INTO paid_city_entitlement(${entitlementColumns}) VALUES(?,?,?,?,?)`).run(...Object.values(rows.entitlement));
  target.prepare(`INSERT INTO pro_setup_task(${setupColumns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(rows.setup));
  return {created:true,cityId:expected.cityId,invoiceId:expected.invoiceId};
}
