import Image from "next/image";
import styles from "./demo.module.css";

/** Illustrative artwork only: never creates an order, asset assignment or Nostr event. */
export default function DemoArtwork() {
  return <div className={styles.artwork} role="img" aria-label="Example share image: BitcoinWalk mark above Powered by Satlantis, over a walk photograph">
    <Image className={styles.photo} src="/brand/walk-1.jpg" fill sizes="(max-width: 700px) 90vw, 600px" alt=""/>
    <Image className={styles.mark} src="/brand/bitcoinwalk-share-icon.png" width={260} height={260} alt=""/>
    <div className={styles.brand}><span>Powered by</span><Image className={styles.sponsorLogo} src="/brand/campaigns/satlantis-white.png" width={2332} height={440} alt=""/></div>
  </div>;
}
