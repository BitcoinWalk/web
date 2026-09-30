"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import type {Event} from "nostr-tools";
import {paymentRequest,type PaymentCommand} from "../payments/auth";
import type {PaymentView} from "../payments/service";
import {signForOrganizer} from "../nostr/organizer-identity";

export async function paymentFetch(event:Event){
 const response=await fetch("/api/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60000),cache:"no-store"});
 const result=await response.json();if(!response.ok)throw new Error(result.error??"Payment service unavailable.");
 return result as {payment?:PaymentView|null;payments?:PaymentView[]};
}
export function signPayment(command:PaymentCommand,owner:string){return signForOrganizer(paymentRequest(command,window.location.origin),owner);}

export default function CityPayment({cityId,revisionId,owner,autoCreate=false,passive=false,onPaid}:{cityId:string;revisionId:string;owner:string;autoCreate?:boolean;passive?:boolean;onPaid?:()=>void}){
 const [payment,setPayment]=useState<PaymentView|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [readRequest,setReadRequest]=useState<Event|null>(null);
 const mounted=useRef(false),lock=useRef(false),started=useRef(false),startedPaid=useRef(false),renewed=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const refresh=useCallback(async(create:boolean)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError("");
  try{
   const event=await signPayment(create?{action:"create",cityId,revisionId}:{action:"status",cityId},owner);
   const result=await paymentFetch(event);if(!mounted.current)return;
   setPayment(result.payment??null);
   const status=create?await signPayment({action:"status",cityId},owner):event;
   if(mounted.current)setReadRequest(status);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Payment unavailable.");}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 },[cityId,revisionId,owner]);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active&&autoCreate&&!started.current){started.current=true;void refresh(true);}});return()=>{active=false;};},[autoCreate,refresh]);
 useEffect(()=>{if(passive&&payment?.status==="expired"&&!renewed.current){renewed.current=true;void refresh(true);}},[passive,payment?.status,refresh]);
 useEffect(()=>{if(payment?.tier==="paid"&&!startedPaid.current){startedPaid.current=true;onPaid?.();}},[payment?.tier,onPaid]);
 useEffect(()=>{
  if(!readRequest||payment?.status==="paid")return;
  let active=true,inFlight=false;
  const timer=setInterval(async()=>{
   if(inFlight)return;
   if(Date.now()/1000-readRequest.created_at>270){clearInterval(timer);if(active){if(passive)void refresh(false);else setError("Automatic checks paused. Select Check payment to continue.");}return;}
   inFlight=true;
   try{const result=await paymentFetch(readRequest);if(active){setPayment(result.payment??null);setError("");}}
   catch(e){if(active)setError(e instanceof Error?e.message:"Payment check unavailable.");}finally{inFlight=false;}
  },15000);
  return()=>{active=false;clearInterval(timer);};
 },[readRequest,payment?.status,passive,refresh]);
 return <section className="city-plan-payment" aria-label="Pro plan payment"><h3>Pro plan — 21,000 sats</h3>
  {payment?.tier==="paid"?<p role="status"><strong>Payment verified. Your city plan is Pro.</strong> City review and setup of the included services continue separately.</p>:<>
   <p>Pay the one-time lifetime fee with a lightning wallet. Payment is verified automatically.</p>
   {payment?.invoice&&payment.status==="pending"&&<QRCodeSVG value={`lightning:${payment.invoice}`} size={320} level="M" marginSize={2} title="Lightning invoice QR code for 21,000 sats"/>}
   {payment?.status==="pending"&&<><p><a href={`lightning:${payment.invoice}`}>Open lightning wallet</a></p><label>Invoice<textarea readOnly value={payment.invoice} rows={4}/></label>{!passive&&<button type="button" onClick={()=>void navigator.clipboard.writeText(payment.invoice).catch(()=>setError("Copy the invoice from the field above."))}>Copy invoice</button>}<p>Expires: {new Date(payment.expiresAt*1000).toLocaleString()}</p></>}
   {payment?.status==="expired"&&<p>This invoice has expired. You can request a new invoice.</p>}
   {payment&&(payment.status==="creating"||payment.status==="creation-uncertain")&&<p>Invoice creation needs support review. Your order has been preserved.</p>}
   {(!payment||payment.status==="expired")&&!passive&&<button type="button" disabled={busy} onClick={()=>void refresh(true)}>{busy?"Preparing invoice…":"Get 21,000-sat invoice"}</button>}
  </>}
  {payment?.paymentHash&&<p>Payment hash: <code style={{overflowWrap:"anywhere"}}>{payment.paymentHash}</code></p>}
  {!passive&&<button type="button" disabled={busy} onClick={()=>void refresh(false)}>{busy?"Checking…":"Check payment"}</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
