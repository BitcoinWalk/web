import type {ReactNode} from "react";
import type {LogoVariantAsset} from "../logos/catalog";
import CityWalkTitle from "./city-walk-title";
import ResilientHero from "./resilient-hero";
import styles from "./walk-event.module.css";

/** One presentation for city pages, whether or not a walk is scheduled. */
export default function CityPageLayout({cityName,titleLogo,heroSources,headerExtra,summary,children,details,utilities,footer,embedded=false}:{
  cityName:string;titleLogo?:LogoVariantAsset;heroSources:(string|null|undefined)[];
  headerExtra?:ReactNode;summary:ReactNode;children:ReactNode;details:ReactNode;
  utilities?:ReactNode;footer?:ReactNode;embedded?:boolean;
}) {
  return <main className={`${styles.page} ${embedded?styles.app:""}`}>
    <header className={styles.header}>
      <div className={styles.heading}><CityWalkTitle cityName={cityName} logo={titleLogo}/>{headerExtra}</div>
      <ResilientHero sources={heroSources} alt={`BitcoinWalk ${cityName}`}/>
      <div className={styles.summary}>{summary}</div>
    </header>
    <div className={styles.content}>
      <article className={styles.primary}>{children}</article>
      <aside className={styles.secondary} aria-label="Walk details and community">{details}</aside>
    </div>
    {utilities&&<section className={styles.utilities} aria-label="Walk links">{utilities}</section>}
    {footer}
  </main>;
}
