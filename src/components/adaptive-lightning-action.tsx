"use client";
import {useState,type ReactNode,type MouseEvent} from "react";
import {QRCodeSVG} from "qrcode.react";
import {currentDevicePrefersLightningWallet} from "./lightning-device";
import styles from "./walk-host.module.css";

export default function AdaptiveLightningAction({href,className,title,children}:{href:string;className?:string;title:string;children:ReactNode}){
 const [open,setOpen]=useState(false),[copied,setCopied]=useState(false);
 function activate(event:MouseEvent<HTMLAnchorElement>){
  if(currentDevicePrefersLightningWallet())return;
  event.preventDefault();setCopied(false);setOpen(true);
 }
 async function copy(){
  try{await navigator.clipboard.writeText(href.replace(/^lightning:/i,""));setCopied(true);}catch{setCopied(false);}
 }
 return <><a className={className} href={href} onClick={activate}>{children}</a>{open&&<div className={styles.backdrop}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="lightning-action-heading"><button className={styles.close} type="button" aria-label="Close Lightning payment" onClick={()=>setOpen(false)}>×</button><h3 id="lightning-action-heading">{title}</h3><p>Scan with a Lightning wallet, or copy the payment address.</p><QRCodeSVG value={href} size={260} level="M" marginSize={2} title={`${title} QR code`}/><button type="button" onClick={()=>void copy()}>{copied?"Copied":"Copy payment address"}</button>{copied&&<p className={styles.copied} role="status">Copied to clipboard.</p>}</section></div>}</>;
}
