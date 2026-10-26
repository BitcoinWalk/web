import type {ReactNode} from "react";
import type {LogoVariantAsset} from "../logos/catalog";
import CityWalkTitle from "./city-walk-title";
import ResilientHero from "./resilient-hero";
import SiteNavigation from "./site-navigation";
import styles from "./walk-event.module.css";
import {MarkdownDescription} from "./rich-description";

/** One presentation for city pages, whether or not a walk is scheduled. */
export default function CityPageLayout({cityName,titleLogo,heroSources,heroDescription,headerExtra,summary,children,details,utilities,footer,embedded=false}:{
  cityName:string;titleLogo?:LogoVariantAsset;heroSources:(string|null|undefined)[];
  heroDescription?:string;headerExtra?:ReactNode;summary:ReactNode;children:ReactNode;details:ReactNode;
  utilities?:ReactNode;footer?:ReactNode;embedded?:boolean;
}) {
  const heading=<div className={styles.heading}><CityWalkTitle cityName={cityName} logo={titleLogo}/>{headerExtra}</div>;
  const hero=<ResilientHero sources={heroSources} alt={`BitcoinWalk ${cityName}`}/>;
  const information=<div className={styles.summary}>{summary}</div>;
  return <>{!embedded&&<SiteNavigation overImage/>}<main className={`bw-original-dark ${styles.page} ${embedded?styles.app:styles.withNavigation}`}>
    {embedded?<header className={styles.header}>{heading}{hero}{information}</header>:<div className={styles.heroStage}>
      <header className={styles.header}>{hero}<div className={styles.heroPanel}>{heading}{heroDescription&&<MarkdownDescription value={heroDescription}/>}</div></header>
      {information}
    </div>}
    <div className={styles.content}>
      <article className={styles.primary}>{children}</article>
      <aside className={styles.secondary} aria-label="Walk details and community">{details}</aside>
    </div>
    {utilities&&<section className={styles.utilities} aria-label="Walk links">{utilities}</section>}
    {footer}
  </main></>;
}
