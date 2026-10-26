"use client";

import Image from "next/image";
import {useId,useRef,type MouseEvent} from "react";
import {QRCodeSVG} from "qrcode.react";
import styles from "./city-directory.module.css";

export default function SignerAppLink({name,icon,href}:{name:string;icon:string;href:string}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLAnchorElement>(null),id=useId();
 function open(event:MouseEvent<HTMLAnchorElement>){
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!matchMedia("(min-width:1101px)").matches)return;
  event.preventDefault();dialog.current?.showModal();
 }
 return <>
  <a ref={trigger} href={href} target="_blank" rel="noreferrer" onClick={open}><Image src={`/brand/signers/${icon}.png`} alt="" width={40} height={40}/><span>{name}</span><span aria-hidden="true">↗</span></a>
  <dialog ref={dialog} className={styles.downloadDialog} aria-labelledby={id} onClose={()=>trigger.current?.focus()} onClick={event=>{
   if(event.target!==event.currentTarget)return;
   const rect=event.currentTarget.getBoundingClientRect();
   if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.current?.close();
  }}>
   <button type="button" className={styles.downloadClose} aria-label="Close app download" onClick={()=>dialog.current?.close()}>×</button>
   <h2 id={id}>Get {name}</h2>
   <p>Scan with your phone to open the app download page.</p>
   <div className={styles.downloadQr}><QRCodeSVG value={href} size={240} marginSize={4} title={`Scan to get ${name}`}/></div>
   <a className={styles.link} href={href} target="_blank" rel="noreferrer">Download page</a>
  </dialog>
 </>;
}
