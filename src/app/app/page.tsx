import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./app.module.css";

const zapstoreUrl="https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie";
const sourceUrl="https://github.com/BitcoinWalk/walkie-talkie";

const title="Walkie Talkie | The BitcoinWalk app";
const description="Find your next BitcoinWalk, join your city community, chat privately and get help from the BitcoinWalk Guide AI bot—all with a Nostr identity you control.";

export const metadata:Metadata={
 metadataBase:new URL("https://bitcoinwalk.org"),
 title,
 description,
 applicationName:"Walkie Talkie",
 authors:[{name:"BitcoinWalk",url:"https://bitcoinwalk.org"}],
 creator:"BitcoinWalk",
 publisher:"BitcoinWalk",
 category:"social networking",
 keywords:["BitcoinWalk","Walkie Talkie","Bitcoin","Nostr","community","walking","Android"],
 alternates:{canonical:"https://bitcoinwalk.org/app"},
 openGraph:{title,description,url:"https://bitcoinwalk.org/app",siteName:"BitcoinWalk",locale:"en_US",type:"website"},
 twitter:{card:"summary_large_image",title,description},
};

function ZapstoreMark(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13.3 2 5.8 13h5.1l-.7 9L18.6 9h-5.3V2Z" fill="currentColor"/></svg>}
function Arrow(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25"/></svg>}
function Check(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25"/></svg>}

function DownloadButton(){return <a className={styles.primaryAction} href={zapstoreUrl} target="_blank" rel="noreferrer"><ZapstoreMark/><span><small>Download from</small>Zapstore</span><Arrow/></a>}

export default function AppPage(){return <main className={styles.page}>
 <header className={styles.header}>
  <Link href="/" aria-label="BitcoinWalk home"><Image src="/brand/bitcoinwalk-horizontal-white.png" width={2000} height={368} priority alt="BitcoinWalk"/></Link>
  <nav aria-label="Walkie Talkie page"><a href="#features">What it does</a><a className={styles.headerCta} href={zapstoreUrl} target="_blank" rel="noreferrer">Get the app</a></nav>
 </header>

 <section className={styles.hero}>
  <div className={styles.heroCopy}>
   <div className={styles.appIdentity}><Image src="/app/walkie-talkie/icon.png" width={512} height={512} alt="Walkie Talkie app icon"/><span>Walkie Talkie for Android</span></div>
   <h1>Your BitcoinWalk.<br/><em>In your pocket.</em></h1>
   <p className={styles.lede}>Find the next walk, join your city and chat privately—all with a Nostr identity you control.</p>
   <div className={styles.actions}><DownloadButton/><a className={styles.secondaryAction} href="#features">Explore the app</a></div>
   <div className={styles.trustLine}><span><Check/>Free and open source</span><span><Check/>No phone number required</span></div>
  </div>
  <div className={styles.heroVisual} aria-label="Walkie Talkie app preview">
   <div className={`${styles.phone} ${styles.phoneBack}`}><Image src="/app/walkie-talkie/walk.png" width={1320} height={2868} priority alt="A BitcoinWalk city page with the next walk and meeting point"/></div>
   <div className={`${styles.phone} ${styles.phoneFront}`}><Image src="/app/walkie-talkie/chats.png" width={1320} height={2868} priority alt="Walkie Talkie chats with the AI Guide, Global and local BitcoinWalk groups"/></div>
   <span className={`${styles.signal} ${styles.signalOrange}`}>Local walks</span>
   <span className={`${styles.signal} ${styles.signalPurple}`}>AI Guide</span>
  </div>
 </section>

 <section className={styles.proofStrip} aria-label="Walkie Talkie highlights"><span>Walks</span><i aria-hidden="true"/><span>City groups</span><i aria-hidden="true"/><span>Encrypted DMs</span><i aria-hidden="true"/><span>AI Guide</span><i aria-hidden="true"/><span>Nostr identity</span></section>

 <section className={styles.features} id="features">
  <div className={styles.sectionHeading}><p>One app. Your community.</p><h2>Walk, talk and stay connected.</h2></div>
  <div className={styles.featureGrid}>
   <article className={styles.featureCard}>
    <div><span>01 · Walks</span><h3>Know where to go.</h3><p>See your city’s next walk, meeting point and local information. Switch cities whenever you travel.</p></div>
    <div className={styles.cardScreen}><Image src="/app/walkie-talkie/walk.png" width={1320} height={2868} alt="BitcoinWalk city and next walk"/></div>
   </article>
   <article className={`${styles.featureCard} ${styles.purpleCard}`}>
    <div><span>02 · Chat</span><h3>Talk to your people.</h3><p>Ask the BitcoinWalk Guide AI bot, join Global and city groups, or send encrypted direct messages.</p></div>
    <div className={styles.cardScreen}><Image src="/app/walkie-talkie/chats.png" width={1320} height={2868} alt="AI Guide, community groups and private chats"/></div>
   </article>
   <article className={`${styles.featureCard} ${styles.orangeCard}`}>
    <div><span>03 · Identity</span><h3>Bring your own identity.</h3><p>Create a Nostr identity or connect one you already use. No phone number or email address required.</p></div>
    <div className={styles.cardScreen}><Image src="/app/walkie-talkie/sign-in.png" width={1320} height={2868} alt="Walkie Talkie Nostr sign-in options"/></div>
   </article>
  </div>
  <div className={styles.quickStart}>
   <p><b>1</b><span><strong>Install</strong> from Zapstore</span></p>
   <i aria-hidden="true"/>
   <p><b>2</b><span><strong>Connect</strong> your Nostr identity</span></p>
   <i aria-hidden="true"/>
   <p><b>3</b><span><strong>Choose</strong> your BitcoinWalk city</span></p>
  </div>
 </section>

 <section className={styles.finalCta}>
  <Image src="/app/walkie-talkie/icon.png" width={512} height={512} alt=""/>
  <div><p>Ready for the next walk?</p><h2>Take BitcoinWalk with you.</h2></div>
  <DownloadButton/>
 </section>

 <footer className={styles.footer}><Link href="/"><Image src="/brand/bitcoinwalk-horizontal-white.png" width={2000} height={368} alt="BitcoinWalk"/></Link><p>Walk locally. Talk freely.</p><span><Link href="/brand">Brand</Link><a href={sourceUrl} target="_blank" rel="noreferrer">Open source</a><a href={zapstoreUrl} target="_blank" rel="noreferrer">Zapstore</a></span></footer>
 </main>}
