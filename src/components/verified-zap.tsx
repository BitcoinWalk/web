"use client";
import {useEffect,useRef,useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import {finalizeEvent,generateSecretKey,nip57,SimplePool,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {relayConfig} from "../lib/relay-config";
import {lightningAddress,verifyPublicZapReceipt} from "../nostr/public-zap";
import {currentDevicePrefersLightningWallet} from "./lightning-device";
import styles from "./walk-host.module.css";

type State={step:"idle"|"preparing"|"invoice"|"verified"|"error";message?:string;invoice?:string;request?:Event;provider?:string;amountMsat?:number;walletLaunch?:boolean};
function exact(event:Event,template:EventTemplate){return verifyEvent(structuredClone(event))&&event.kind===template.kind&&event.created_at===template.created_at&&event.content===template.content&&JSON.stringify(event.tags)===JSON.stringify(template.tags);}

export default function VerifiedZap({href,recipient,event}:{href:string;recipient:string;event?:Event}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState("100"),[comment,setComment]=useState(""),[identified,setIdentified]=useState(false),[state,setState]=useState<State>({step:"idle"});
 const cancelled=useRef(false),watching=useRef(false),stopWatch=useRef<null|(()=>void)>(null);
 useEffect(()=>{cancelled.current=false;return()=>{cancelled.current=true;stopWatch.current?.();};},[]);
 async function start(){
  setState({step:"preparing",message:"Preparing your verified zap…"});
  try{
   const sats=Number(amount);if(!Number.isSafeInteger(sats)||sats<1||sats>1_000_000)throw new Error("Choose an amount between 1 and 1,000,000 sats.");
   if(comment.length>280)throw new Error("Keep the message to 280 characters or fewer.");
   const address=lightningAddress(href),amountMsat=sats*1000;
   const compatibleEvent=event?.pubkey===recipient?event:undefined,template=nip57.makeZapRequest(compatibleEvent?{event:compatibleEvent,amount:amountMsat,comment,relays:relayConfig.zapReceiptRelays}:{pubkey:recipient,amount:amountMsat,comment,relays:relayConfig.zapReceiptRelays});
   let request:Event;
   if(identified){if(!window.nostr)throw new Error("No Nostr browser extension was found. Turn off ‘Show my Nostr identity’ to zap privately.");request=await window.nostr.signEvent(template);}
   else request=finalizeEvent({...template,tags:[...template.tags,["anon"]]},generateSecretKey());
   if(!exact(request,identified?template:{...template,tags:[...template.tags,["anon"]]}))throw new Error("The signer returned a different or invalid zap request.");
   const invoiceResponse=await fetch("/api/public/zap-invoice",{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({address:address.address,amountMsat,zapRequest:JSON.stringify(request)}),signal:AbortSignal.timeout(20_000)}),body=await invoiceResponse.json() as {invoice?:unknown;provider?:unknown;error?:unknown};
   if(!invoiceResponse.ok||typeof body.invoice!=="string"||typeof body.provider!=="string")throw new Error(typeof body.error==="string"?body.error:"The zap invoice could not be created.");
   if(cancelled.current)return;const walletLaunch=currentDevicePrefersLightningWallet();setState({step:"invoice",invoice:body.invoice,request,provider:body.provider,amountMsat,walletLaunch,message:"Waiting for payment confirmation… This updates automatically after payment."});void watch(request,body.provider,amountMsat);if(walletLaunch)window.location.assign(`lightning:${body.invoice}`);
  }catch(error){setState({step:"error",message:error instanceof Error?error.message:"The zap could not be prepared."});}
 }
 async function watch(request:Event,provider:string,amountMsat:number){
  if(watching.current)return;watching.current=true;
  const pool=new SimplePool({enableReconnect:true});let subscription:{close:(reason?:string)=>void}|undefined,finished=false;
  const stop=()=>{if(finished)return;finished=true;subscription?.close();pool.close(relayConfig.zapReceiptRelays);pool.destroy();watching.current=false;if(stopWatch.current===stop)stopWatch.current=null;};stopWatch.current=stop;
  try{subscription=pool.subscribeMany(relayConfig.zapReceiptRelays,{kinds:[9735],authors:[provider],"#p":[recipient],since:request.created_at-30,limit:20},{maxWait:4_000,onevent:row=>{void (async()=>{if(finished||cancelled.current)return;if(await verifyPublicZapReceipt(row,request,provider,recipient,amountMsat)){setState({step:"verified",message:"Payment confirmed. Incoming zap verified on Nostr; the host’s 79% payout is processed separately."});stop();}})();}});}catch{stop();if(!cancelled.current)setState(current=>current.step==="invoice"?{...current,message:"Waiting for payment confirmation… Automatic checking will reconnect while this window stays open."}:current);}
 }
 function close(){cancelled.current=true;stopWatch.current?.();setOpen(false);setState({step:"idle"});}
 return <><button type="button" className={styles.zap} onClick={()=>{cancelled.current=false;setIdentified(Boolean(window.nostr));setOpen(true);}}>Zap the host ⚡</button>{open&&<div className={styles.backdrop}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="verified-zap-heading"><button className={styles.close} type="button" aria-label="Close zap dialog" onClick={close}>×</button><h3 id="verified-zap-heading">Zap the host</h3><p>79% goes to the local host; BitcoinWalk keeps 21%.</p>{state.step!=="invoice"&&state.step!=="verified"&&<><label>Amount in sats<input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Message (optional)<input maxLength={280} value={comment} onChange={e=>setComment(e.target.value)}/></label><label className={styles.check}><input type="checkbox" checked={identified} onChange={e=>setIdentified(e.target.checked)}/> Show my Nostr identity</label><button type="button" disabled={state.step==="preparing"} onClick={()=>void start()}>{state.step==="preparing"?"Preparing…":"Create zap invoice"}</button></>}{state.step==="invoice"&&state.invoice&&<>{!state.walletLaunch&&<QRCodeSVG value={`lightning:${state.invoice}`} size={260} level="M" marginSize={2} title="Verified Nostr zap invoice"/>}<p><a href={`lightning:${state.invoice}`}>{state.walletLaunch?"Open Lightning wallet again":"Open Lightning wallet"}</a></p><button type="button" onClick={()=>void navigator.clipboard.writeText(state.invoice!).catch(()=>{})}>Copy invoice</button></>}{state.message&&<p className={state.step==="verified"?styles.verified:undefined} role="status">{state.message}</p>}{state.step==="verified"&&<button type="button" onClick={close}>Done</button>}</section></div>}</>;
}
