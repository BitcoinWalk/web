import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./app.module.css";

const zapstoreUrl="https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie";
const sourceUrl="https://github.com/BitcoinWalk/walkie-talkie";

export const metadata:Metadata={
 title:"Walkie Talkie · Your BitcoinWalk companion",
 description:"Find your next BitcoinWalk, join your city chat and keep your Nostr identity in your own hands with the Walkie Talkie Android app.",
 alternates:{canonical:"https://bitcoinwalk.org/app"},
 openGraph:{
  title:"Walkie Talkie · Your BitcoinWalk companion",
  description:"Walks, city chats and private messages—built for the BitcoinWalk community.",
  url:"https://bitcoinwalk.org/app",
  siteName:"BitcoinWalk",
  type:"website",
  images:[{url:"https://bitcoinwalk.org/app/walkie-talkie/chats.png",width:1320,height:2868,alt:"Walkie Talkie city and community chats"}],
 },
 twitter:{card:"summary_large_image",title:"Walkie Talkie · Your BitcoinWalk companion",description:"Walks, city chats and private messages—built for the BitcoinWalk community.",images:["https://bitcoinwalk.org/app/walkie-talkie/chats.png"]},
};

function ZapstoreMark(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13.3 2 5.8 13h5.1l-.7 9L18.6 9h-5.3V2Z" fill="currentColor"/></svg>}
function Arrow(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25"/></svg>}
function Check(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25"/></svg>}

export default function AppPage(){return <main className={styles.page}>
 <header className={styles.header}>
  <Link href="/" aria-label="BitcoinWalk home"><Image src="/brand/bitcoinwalk-horizontal-white.png" width={2000} height={368} priority alt="BitcoinWalk"/></Link>
  <nav aria-label="Walkie Talkie page"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a className={styles.headerCta} href={zapstoreUrl} target="_blank" rel="noreferrer">Get the app</a></nav>
 </header>

 <section className={styles.hero}>
  <div className={styles.heroCopy}>
   <div className={styles.appIdentity}><Image src="/app/walkie-talkie/icon.png" width={512} height={512} alt="Walkie Talkie app icon"/><span>Walkie Talkie for Android</span></div>
   <h1>Your BitcoinWalk.<br/><em>In your pocket.</em></h1>
   <p className={styles.lede}>See the next walk, talk with your local community and message people privately—all with a Nostr identity you control.</p>
   <div className={styles.actions}>
    <a className={styles.primaryAction} href={zapstoreUrl} target="_blank" rel="noreferrer"><ZapstoreMark/><span><small>Download from</small>Zapstore</span><Arrow/></a>
    <a className={styles.secondaryAction} href="#features">See what it does</a>
   </div>
   <div className={styles.trustLine}><span><Check/>Free and open source</span><span><Check/>No phone number required</span></div>
  </div>
  <div className={styles.heroVisual} aria-label="Walkie Talkie app preview">
   <div className={`${styles.phone} ${styles.phoneBack}`}><Image src="/app/walkie-talkie/walk.png" width={1320} height={2868} priority alt="A BitcoinWalk city page with the next walk and meeting point"/></div>
   <div className={`${styles.phone} ${styles.phoneFront}`}><Image src="/app/walkie-talkie/chats.png" width={1320} height={2868} priority alt="Walkie Talkie showing Guide, Global, city and host chats"/></div>
   <span className={`${styles.signal} ${styles.signalOrange}`}>Local walks</span>
   <span className={`${styles.signal} ${styles.signalPurple}`}>Private Guide</span>
  </div>
 </section>

 <section className={styles.proofStrip} aria-label="Walkie Talkie highlights"><span>Walks</span><i aria-hidden="true"/><span>City groups</span><i aria-hidden="true"/><span>Encrypted DMs</span><i aria-hidden="true"/><span>Lightning</span><i aria-hidden="true"/><span>Nostr identity</span></section>

 <section className={styles.story} id="features">
  <div className={styles.sectionHeading}><p>Made for the walk</p><h2>Everything around your BitcoinWalk, without the noise.</h2><span>One simple app for showing up, staying in touch and finding your people.</span></div>
  <article className={`${styles.storyRow} ${styles.walkStory}`}>
   <div className={styles.storyCopy}><span className={styles.number}>01</span><p className={styles.kicker}>Know where to go</p><h3>Your city and next walk are always close.</h3><p>Choose your BitcoinWalk once, then see its next date, meeting point, weather and local information whenever you open the app.</p><ul><li><Check/>Switch cities whenever you travel</li><li><Check/>Open the meeting point in your maps app</li><li><Check/>See the city’s own identity and information</li></ul></div>
   <div className={styles.screenshotStage}><div className={styles.phoneSingle}><Image src="/app/walkie-talkie/walk.png" width={1320} height={2868} alt="BitcoinWalk Madeira details and next walk"/></div></div>
  </article>
  <article className={`${styles.storyRow} ${styles.chatStory}`}>
   <div className={styles.storyCopy}><span className={styles.number}>02</span><p className={styles.kicker}>Talk to the community</p><h3>The conversations that matter, in one list.</h3><p>Start with BitcoinWalk Guide and Global, then open your selected city group. Organizers also get a private host space, while personal conversations stay alongside them.</p><ul><li><Check/>City and global community groups</li><li><Check/>Private, encrypted direct messages</li><li><Check/>Photos, files, voice and Lightning requests</li></ul></div>
   <div className={styles.screenshotStage}><div className={styles.phoneSingle}><Image src="/app/walkie-talkie/chats.png" width={1320} height={2868} alt="Walkie Talkie community chat list"/></div></div>
  </article>
  <article className={`${styles.storyRow} ${styles.identityStory}`}>
   <div className={styles.storyCopy}><span className={styles.number}>03</span><p className={styles.kicker}>Bring your identity</p><h3>Your account is a key, not a platform profile.</h3><p>Create a new Nostr identity or connect one you already use. Walkie Talkie does not require a phone number or email address.</p><ul><li><Check/>Create an identity in the app</li><li><Check/>Connect a remote signer such as Amber</li><li><Check/>Use a familiar Nostr name and profile</li></ul></div>
   <div className={styles.screenshotStage}><div className={styles.phoneSingle}><Image src="/app/walkie-talkie/sign-in.png" width={1320} height={2868} alt="Walkie Talkie sign-in choices"/></div></div>
  </article>
 </section>

 <section className={styles.steps} id="how-it-works">
  <div className={styles.sectionHeading}><p>Start walking</p><h2>From install to your city in three steps.</h2></div>
  <div className={styles.stepGrid}>
   <article><span>1</span><h3>Install from Zapstore</h3><p>Open the verified listing on your Android phone and install the latest Walkie Talkie release.</p></article>
   <article><span>2</span><h3>Connect your identity</h3><p>Create a Nostr identity, use your private key, or approve access through a remote signer.</p></article>
   <article><span>3</span><h3>Choose your BitcoinWalk</h3><p>Select your city to see its walk and make its community chat your local home.</p></article>
  </div>
  <div className={styles.cityPreview}><div><p className={styles.kicker}>From Augsburg to Austin</p><h3>One movement, city by city.</h3><p>Walkie Talkie reads the active BitcoinWalk directory, so your city choices stay connected to the wider community.</p></div><div className={styles.cityPhone}><Image src="/app/walkie-talkie/cities.png" width={1320} height={2868} alt="Choose your BitcoinWalk city"/></div></div>
 </section>

 <section className={styles.openSection}>
  <div><p className={styles.kicker}>Open by design</p><h2>Built in public.<br/>Owned by its users.</h2></div>
  <div className={styles.openCopy}><p>Walkie Talkie is open-source software built around Nostr and Bitcoin. Your identity remains portable, and the source is available for anyone to inspect.</p><a href={sourceUrl} target="_blank" rel="noreferrer">View the source on GitHub <Arrow/></a></div>
 </section>

 <section className={styles.finalCta}>
  <Image src="/app/walkie-talkie/icon.png" width={512} height={512} alt=""/>
  <p>Ready for the next walk?</p><h2>Take BitcoinWalk with you.</h2>
  <a className={styles.primaryAction} href={zapstoreUrl} target="_blank" rel="noreferrer"><ZapstoreMark/><span><small>Download from</small>Zapstore</span><Arrow/></a>
  <small>Available now for Android.</small>
 </section>

 <footer className={styles.footer}><Link href="/"><Image src="/brand/bitcoinwalk-horizontal-white.png" width={2000} height={368} alt="BitcoinWalk"/></Link><p>Walk locally. Talk freely.</p><span><Link href="/brand">Brand</Link><a href={sourceUrl} target="_blank" rel="noreferrer">Source</a><a href={zapstoreUrl} target="_blank" rel="noreferrer">Zapstore</a></span></footer>
 </main>}
