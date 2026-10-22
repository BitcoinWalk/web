import type {Metadata} from "next";
import Link from "next/link";
import SponsorCheckout from "../checkout";
import styles from "./page.module.css";
export const metadata:Metadata={title:"Sponsor the Lugano conference BitcoinWalk | 210,000 sats",description:"Sponsor the Plan ₿ Forum BitcoinWalk side-event in Lugano on Sunday 25 October 2026 at 10:00am. Your logo everywhere this walk is advertised."};
export default function LuganoEventSponsorship(){return <main className={styles.page}>
 <div className={styles.salesGrid}>
  <header className={styles.hero}><span className={styles.eyebrow}>Plan ₿ Forum · Lugano</span><h1>Sponsor the Sunday BitcoinWalk.</h1><p className={styles.lead}>Put your brand on the walk that brings conference visitors and local Bitcoiners together.</p><p className={styles.event}><strong>Sunday 25 October · 10:00</strong><span>Satoshi Nakamoto Statue, Parco Ciani</span></p><div className={styles.offer}><strong>210,000 sats</strong><span>Exclusive event sponsorship</span></div><p className={styles.placement}><span aria-hidden="true">✓</span>Your logo goes on the event page, share images and promotional artwork.</p><a className={styles.cta} href="#sponsor-checkout">Sponsor the walk <span aria-hidden="true">→</span></a></header>
  <section id="sponsor-checkout" className={styles.checkout}><span className={styles.eyebrow}>Secure the sponsorship</span><h2>Become the sponsor</h2><SponsorCheckout initialCity="Lugano" luganoEvent/></section>
 </div>
 <p className={styles.back}><Link href="/lugano">← View the Lugano walk</Link></p>
 </main>;}
