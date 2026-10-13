"use client";
import {useId,useState,type ReactNode,type MouseEvent} from "react";
import {QRCodeSVG} from "qrcode.react";
import AdaptiveLightningAction from "../../components/adaptive-lightning-action";
import styles from "./brand.module.css";

const onchainAddress="bc1qhx0dz0hnt2u4y72eatetu4jjrwy26v0p940yc3";
export const liquidDonationAddress="VJLERH2hvC7CuoWvisEq5Ea2VpXvnK1exEXha83AczeUxWtCNN8LBArjgEHKHhNxAeV5JDniR8hcDQbr";

function AddressAction({href,address,title,children}:{href:string;address:string;title:string;children:ReactNode}){
 const headingId=`brand-donation-${useId().replace(/:/g,"")}`,[open,setOpen]=useState(false),[copied,setCopied]=useState(false);
 function activate(event:MouseEvent<HTMLAnchorElement>){event.preventDefault();setCopied(false);setOpen(true);}
 async function copy(){try{await navigator.clipboard.writeText(address);setCopied(true);}catch{setCopied(false);}}
 return <><a className={styles.donateButton} href={href} onClick={activate}>{children}</a>{open&&<div className={styles.donationBackdrop}><section className={styles.donationDialog} role="dialog" aria-modal="true" aria-labelledby={headingId}><button className={styles.donationClose} type="button" aria-label={`Close ${title}`} onClick={()=>setOpen(false)}>×</button><h3 id={headingId}>{title}</h3><p>Scan with a compatible wallet, or copy the address.</p><QRCodeSVG value={href} size={260} level="M" marginSize={2} title={`${title} QR code`}/><code>{address}</code><button type="button" onClick={()=>void copy()}>{copied?"Copied":"Copy address"}</button>{copied&&<p role="status">Copied to clipboard.</p>}</section></div>}</>;
}

export default function BrandDonations(){return <aside className={styles.donations} aria-labelledby="brand-donations-heading"><p className={styles.eyebrow}>Value for value</p><h3 id="brand-donations-heading">Enjoyed making this?</h3><p>The brand tools are free. If they created value for you, an optional donation helps BitcoinWalk keep building.</p><div className={styles.donationActions}><AdaptiveLightningAction className={styles.donateButton} href="lightning:donate@bitcoinwalk.org" title="Donate to BitcoinWalk with Lightning">Lightning ⚡</AdaptiveLightningAction><AddressAction href={`bitcoin:${onchainAddress}`} address={onchainAddress} title="Donate bitcoin on-chain">On-chain ₿</AddressAction><AddressAction href={`liquidnetwork:${liquidDonationAddress}`} address={liquidDonationAddress} title="Donate Liquid bitcoin">Liquid</AddressAction></div><small>Donations are optional and do not unlock features, change permissions or purchase a city plan.</small></aside>}
