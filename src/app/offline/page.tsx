"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./offline.module.css";

export default function OfflinePage(){return <main className={styles.page}>
 <Image src="/brand/bitcoinwalk-horizontal.png" width={2000} height={368} alt="BitcoinWalk" priority/>
 <div className={styles.mark} aria-hidden="true"><span/></div>
 <h1>You’re offline</h1>
 <p>Reconnect to load current walk details or make changes. BitcoinWalk never submits a saved action while this fallback is showing.</p>
 <div><button type="button" onClick={()=>window.location.reload()}>Try again</button><Link href="/">BitcoinWalk home</Link></div>
 </main>;}

