"use client";
import {useEffect,useRef,useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import type {GiftPaymentView} from "../payments/service";

function recoveryToken(cityId:string){const key=`bitcoinwalk:gift-pro:${cityId}`;let value=localStorage.getItem(key);if(!/^[a-f0-9]{64}$/.test(value??"")){const bytes=crypto.getRandomValues(new Uint8Array(32));value=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");localStorage.setItem(key,value);}return value!;}
async function request(action:"create"|"status",cityId:string,revisionId:string,token:string){const response=await fetch("/api/city-upgrades",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,cityId,revisionId,token}),cache:"no-store",signal:AbortSignal.timeout(60_000)}),body=await response.json();if(!response.ok)throw new Error(body.error||"Upgrade checkout unavailable.");return body.payment as GiftPaymentView;}

export default function CitySupportActions({cityId,revisionId,cityName,upgradeAvailable}:{cityId:string;revisionId:string;cityName:string;upgradeAvailable:boolean}){
 const [payment,setPayment]=useState<GiftPaymentView|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");const lock=useRef(false);
 async function run(action:"create"|"status"){if(lock.current)return;lock.current=true;setBusy(true);setMessage("");try{setPayment(await request(action,cityId,revisionId,recoveryToken(cityId)));}catch(error){setMessage(error instanceof Error?error.message:"Upgrade checkout unavailable.");}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{if(!payment||payment.status!=="pending")return;const timer=setInterval(()=>void run("status"),15_000);return()=>clearInterval(timer);});
 if(!upgradeAvailable&&!payment&&!message)return null;
 return <section aria-label={`Upgrade BitcoinWalk ${cityName}`}><h2>Upgrade this BitcoinWalk</h2>
  {upgradeAvailable&&payment?.tier!=="paid"&&<article><h3>Upgrade this city to Pro</h3><p>Anyone can gift the one-time 21,000-sat upgrade. The organizer keeps control and completes private payout setup; future payments to the city then send 79% to the organizer and retain 21% for BitcoinWalk.</p>
   {!payment&&<button type="button" disabled={busy} onClick={()=>void run("create")}>{busy?"Preparing invoice…":"Upgrade this city — 21,000 sats"}</button>}
   {payment?.status==="pending"&&payment.invoice&&<><QRCodeSVG value={`lightning:${payment.invoice}`} size={280} level="M" marginSize={2} title="Lightning invoice QR code for the city Pro upgrade"/><p><a href={`lightning:${payment.invoice}`}>Open lightning wallet</a></p><button type="button" onClick={()=>void navigator.clipboard.writeText(payment.invoice!).then(()=>setMessage("Invoice copied.")).catch(()=>setMessage("Copy the invoice from your wallet link."))}>Copy invoice</button><p>Expires {new Date(payment.expiresAt*1000).toLocaleString()}</p></>}
   {payment?.status==="expired"&&<button type="button" disabled={busy} onClick={()=>void run("create")}>Create a new invoice</button>}
   {payment&&(payment.status==="creating"||payment.status==="creation-uncertain")&&<p>The checkout is preserved for recovery. No second invoice will be created automatically.</p>}
   {payment&&<button type="button" disabled={busy} onClick={()=>void run("status")}>{busy?"Checking…":"Check payment"}</button>}
  </article>}
  {payment?.tier==="paid"&&<p role="status"><strong>Pro upgrade payment verified.</strong> The organizer can now complete the city identity and payout setup without paying again.</p>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
