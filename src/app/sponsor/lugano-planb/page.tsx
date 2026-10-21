import type {Metadata} from "next";
import Link from "next/link";
import SponsorCheckout from "../checkout";
import styles from "./page.module.css";
export const metadata:Metadata={title:"Sponsor the Lugano conference BitcoinWalk | 210,000 sats",description:"Sponsor the Plan ₿ Forum BitcoinWalk side-event in Lugano on Sunday 25 October 2026 at 10:00am. Your logo everywhere this walk is advertised."};
export default function LuganoEventSponsorship(){return <main className={styles.page}>
 <header className={styles.hero}><span className={styles.eyebrow}>Plan ₿ Forum · BitcoinWalk side-event</span><h1>Keep the conversation going beyond the conference.</h1><p className={styles.lead}>Sponsor the Lugano BitcoinWalk and bring conference visitors and local Bitcoiners together for a free, welcoming Sunday walk.</p><p>In solidarity with Simply Bitcoin.</p><p><strong>Lugano · Sunday 25 October 2026 · 10:00am local time</strong></p><div className={styles.offer}><strong>210,000 sats</strong><span>One event sponsorship</span></div><a className={styles.cta} href="#sponsor-checkout">Sponsor this side-event →</a></header>
 <section className={styles.benefits}><h2>Your logo, everywhere this walk is advertised.</h2><p>As this event’s sponsor, your logo will be displayed everywhere this walk is advertised, including the event page, share images and promotional materials for this BitcoinWalk side-event.</p><p>Support the walk that keeps people connecting after Plan ₿ Forum. This sponsorship covers the Sunday Lugano BitcoinWalk side-event.</p></section>
 <section id="sponsor-checkout" className={styles.checkout}><h2>Sponsor the Lugano side-event</h2><SponsorCheckout initialCity="Lugano" luganoEvent/></section><p><Link href="/lugano">← Back to the Lugano walk</Link></p>
 </main>;}
