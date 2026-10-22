import type {Metadata} from "next";
import Link from "next/link";
import LuganoSponsorExperience from "./experience";
import styles from "./page.module.css";
export const metadata:Metadata={title:"Sponsor the Lugano conference BitcoinWalk | 210,000 sats",description:"Sponsor the Plan ₿ Forum BitcoinWalk side-event in Lugano on Sunday 25 October 2026 at 10:00am. Your logo everywhere this walk is advertised."};
export default function LuganoEventSponsorship(){return <main className={styles.page}>
 <LuganoSponsorExperience/>
 <p className={styles.back}><Link href="/lugano">← View the Lugano walk</Link></p>
 </main>;}
