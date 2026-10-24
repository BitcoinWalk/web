"use client";

import Image from "next/image";
import {QRCodeSVG} from "qrcode.react";
import {useEffect,useState} from "react";
import styles from "./chat.module.css";

const DISMISS_KEY="bitcoinwalk:chat-app-promotion:v1";
const DOWNLOAD_URL="https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie";

export default function ChatAppPromotion({canonicalPath,roomLabel}:{canonicalPath:string;roomLabel:string}){
 const [dismissed,setDismissed]=useState<boolean|null>(null),[copied,setCopied]=useState(false),[origin,setOrigin]=useState(""),roomUrl=origin?new URL(canonicalPath,origin).href:"";
 useEffect(()=>{queueMicrotask(()=>setCopied(false));},[canonicalPath]);
 useEffect(()=>{queueMicrotask(()=>{setOrigin(window.location.origin);try{setDismissed(window.localStorage.getItem(DISMISS_KEY)==="dismissed");}catch{setDismissed(false);}});},[]);
 function dismiss(){try{window.localStorage.setItem(DISMISS_KEY,"dismissed");}catch{}setDismissed(true);}
 async function copy(){if(!roomUrl)return;try{await navigator.clipboard.writeText(roomUrl);setCopied(true);}catch{setCopied(false);}}
 return <>
  {dismissed===false&&<aside className={styles.mobileAppPromotion} aria-labelledby="chat-app-promotion-title">
   <Image src="/brand/walkie-talkie-zapstore-icon.png" width={44} height={44} alt=""/>
   <div><strong id="chat-app-promotion-title">Take this chat with you</strong><span>Get Walkie Talkie, then keep this exact {roomLabel} room link.</span></div>
   <button className={styles.promotionClose} type="button" aria-label="Dismiss app suggestion" onClick={dismiss}>×</button>
   <div className={styles.promotionActions}><a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">Get the app</a><button type="button" onClick={()=>void copy()}>{copied?"Room link copied":"Copy room link"}</button></div>
   {copied&&<span className={styles.srOnly} role="status">Exact room link copied.</span>}
  </aside>}
  {dismissed===true&&<div className={styles.mobileAppPromotionQuiet}><a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">Get Walkie Talkie</a><span aria-hidden="true">·</span><button type="button" onClick={()=>void copy()}>{copied?"Room link copied":"Copy room link"}</button><span className={styles.srOnly} role="status">{copied?"Exact room link copied.":""}</span></div>}
  <details className={styles.desktopAppPromotion}>
   <summary>Use on your phone</summary>
   <div className={styles.desktopAppPromotionPanel}>
    <strong>Continue in {roomLabel}</strong>
    <p>Scan the exact room link. It opens safely in the browser today and will open Walkie Talkie when verified app links are available.</p>
    {roomUrl&&<QRCodeSVG value={roomUrl} size={156} level="M" marginSize={2} title={`${roomLabel} room link QR code`}/>} 
    <div><button type="button" onClick={()=>void copy()}>{copied?"Room link copied":"Copy room link"}</button><a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">Get the app ↗</a></div>
    {copied&&<span className={styles.srOnly} role="status">Exact room link copied.</span>}
   </div>
  </details>
 </>;
}
