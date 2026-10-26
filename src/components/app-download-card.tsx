"use client";
import {useRef,type MouseEvent} from "react";
import {QRCodeSVG} from "qrcode.react";
import styles from "./city-directory.module.css";
const destination="https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie";
export default function AppDownloadCard(){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLAnchorElement>(null);
 function open(event:MouseEvent<HTMLAnchorElement>){
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!matchMedia("(min-width:1101px)").matches)return;
  event.preventDefault();dialog.current?.showModal();
 }
 return <><section className={styles.walkieDownload} aria-labelledby="walkie-download-title"><a ref={trigger} className={styles.zapstoreButton} href={destination} onClick={open} aria-label="Download Walkie Talkie on Zapstore"><span className={styles.walkieIcon} aria-hidden="true"><span className={styles.walkieMark}/></span><span><h2 id="walkie-download-title">Get your BitcoinWalk companion app</h2><span className={styles.zapstoreLabel}>Download on Zapstore</span></span><span aria-hidden="true">↗</span></a></section>
 <dialog ref={dialog} className={styles.downloadDialog} aria-labelledby="app-download-heading" onClose={()=>trigger.current?.focus()} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.current?.close();}}}>
 <button type="button" className={styles.downloadClose} aria-label="Close app download" onClick={()=>dialog.current?.close()}>×</button><h2 id="app-download-heading">Get Walkie Talkie</h2><p>Scan with your phone to download from Zapstore.</p><div className={styles.downloadQr}><QRCodeSVG value={destination} size={240} marginSize={4} title="Scan to download Walkie Talkie from Zapstore"/></div><a className={styles.link} href={destination} target="_blank" rel="noopener noreferrer">Go to download page ↗</a>
 </dialog></>;
}
