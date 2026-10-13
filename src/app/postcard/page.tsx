import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import BrandDonations from "../brand/brand-donations";
import styles from "../brand/brand.module.css";
import PostcardStudio from "../brand/postcard-studio";

export const metadata:Metadata={
 title:"Postcard maker · BitcoinWalk",
 description:"Create a BitcoinWalk postcard from your own photograph or a generated background.",
};

export default function PostcardPage(){return <main className={`${styles.page} ${styles.postcardPage}`}>
 <header className={styles.header}>
  <Link href="/" aria-label="BitcoinWalk home"><Image src="/brand/bitcoinwalk-horizontal.png" width={2000} height={368} priority alt="BitcoinWalk"/></Link>
  <nav aria-label="Postcard page"><Link href="/brand">Brand guide</Link><Link href="/">Find a walk</Link></nav>
 </header>
 <section className={`${styles.section} ${styles.studioSection}`}>
  <div className={styles.sectionIntro}><p className={styles.eyebrow}>BitcoinWalk postcard maker</p><h1>Put BitcoinWalk in the picture</h1><p>Approved city organizers and the super-admin can upload a photo or generate a new background for free. BitcoinWalk applies the selected approved mark and your caption after the background is ready.</p></div>
  <PostcardStudio/>
  <BrandDonations/>
 </section>
 <footer className={styles.footer}><Image src="/brand/bitcoinwalk-icon.png" width={64} height={64} alt=""/><p>Walk locally. Share globally.</p><Link href="/brand">Explore the brand guide</Link></footer>
 </main>}
