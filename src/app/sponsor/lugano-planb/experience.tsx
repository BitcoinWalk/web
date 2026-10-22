"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import SponsorCheckout,{type SponsorCheckoutHandle,type SponsorCheckoutState} from "../checkout";
import styles from "./page.module.css";

const initialState:SponsorCheckoutState={canCreate:false,busy:false,hasOrder:false};
export default function LuganoSponsorExperience(){
 const checkout=useRef<SponsorCheckoutHandle>(null),hadOrder=useRef(false),[state,setState]=useState(initialState);
 const updateState=useCallback((next:SponsorCheckoutState)=>setState(next),[]);
 useEffect(()=>{if(state.hasOrder&&!hadOrder.current){const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;document.getElementById("sponsor-checkout")?.scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});}hadOrder.current=state.hasOrder;},[state.hasOrder]);
 return <div className={styles.salesGrid}>
  <header className={styles.hero}><span className={styles.eyebrow}>Plan ₿ Forum · Lugano</span><h1>Sponsor the Sunday BitcoinWalk.</h1><p className={styles.lead}>Put your brand on the walk that brings conference visitors and local Bitcoiners together.</p><p className={styles.event}><strong>Sunday 25 October · 10:00</strong><span>Satoshi Nakamoto Statue, Parco Ciani</span></p><div className={styles.offer}><strong>210,000 sats</strong><span>Exclusive event sponsorship</span></div><p className={styles.placement}><span aria-hidden="true">✓</span>Your logo goes on the event page, share images and promotional artwork.</p>{!state.hasOrder&&<button type="button" className={styles.cta} disabled={!state.canCreate} onClick={()=>checkout.current?.createInvoice()}>{state.busy?"Preparing invoice…":"Sponsor this BitcoinWalk"}</button>}</header>
  <section id="sponsor-checkout" className={styles.checkout}><span className={styles.eyebrow}>Secure the sponsorship</span><h2>{state.hasOrder?"Complete your payment":"Become the sponsor"}</h2><SponsorCheckout ref={checkout} initialCity="Lugano" luganoEvent externalCreate onCreateStateChange={updateState}/></section>
 </div>;
}
