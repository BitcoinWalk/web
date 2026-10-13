import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./brand.module.css";

export const metadata:Metadata={title:"Brand guide · BitcoinWalk",description:"BitcoinWalk logos, working colours, typography and guidance for local creative communities."};

const swatches=[
 {name:"Bitcoin orange",value:"#F7931A",dark:false},
 {name:"Walk ink",value:"#252824",dark:true},
 {name:"Warm paper",value:"#F7F0E4",dark:false},
 {name:"Stone",value:"#62645F",dark:true},
 {name:"White",value:"#FFFFFF",dark:false},
];
const globalVariants=[
 {file:"bitcoinwalk-avatar-orange",name:"Round symbol",use:"Orange roundel",dark:false},
 {file:"bitcoinwalk-avatar-ink",name:"Round symbol",use:"Ink roundel",dark:false},
 {file:"bitcoinwalk-avatar-reversed",name:"Round symbol",use:"Reversed on orange",dark:true},
 {file:"bitcoinwalk-symbol-orange",name:"Standalone symbol",use:"Orange artwork",dark:false},
 {file:"bitcoinwalk-symbol-ink",name:"Standalone symbol",use:"Ink artwork",dark:false},
 {file:"bitcoinwalk-symbol-reversed",name:"Standalone symbol",use:"Reversed on orange",dark:true},
 {file:"bitcoinwalk-horizontal",name:"Horizontal logo",use:"Standard colour",dark:false},
 {file:"bitcoinwalk-horizontal-ink",name:"Horizontal logo",use:"Ink artwork",dark:false},
 {file:"bitcoinwalk-horizontal-reversed",name:"Horizontal logo",use:"Reversed on orange",dark:true},
 {file:"bitcoinwalk-vertical",name:"Vertical logo",use:"Standard colour",dark:false},
 {file:"bitcoinwalk-vertical-ink",name:"Vertical logo",use:"Ink artwork",dark:false},
 {file:"bitcoinwalk-vertical-reversed",name:"Vertical logo",use:"Reversed on orange",dark:true},
];

export default function BrandPage(){return <main className={styles.page}>
 <header className={styles.header}><Link href="/" aria-label="BitcoinWalk home"><Image src="/brand/bitcoinwalk-horizontal.png" width={2000} height={368} priority alt="BitcoinWalk"/></Link><nav aria-label="Brand page"><a href="#movement">Movement</a><a href="#logos">Logos</a><a href="#colour">Colour</a><a href="#type">Type</a><Link href="/postcard">Postcard maker</Link></nav></header>
 <section className={styles.hero}><p className={styles.eyebrow}>BitcoinWalk brand</p><h1>Made to walk.<br/>Built to travel.</h1><p>Approved marks and practical foundations for local BitcoinWalk communities, merchandise and shared stories.</p></section>
 <section className={`${styles.section} ${styles.movement}`} id="movement"><div className={styles.sectionIntro}><p className={styles.eyebrow}>A global franchise movement</p><h2>One shared idea.<br/>Local creative economies.</h2></div><div className={styles.movementGrid}><p>BitcoinWalk gives creative people a recognizable idea they can bring to life in their own communities. Local organizers, makers and artists can create merchandise, craft, media and experiences around their BitcoinWalk—and earn from the value they create.</p><p>The aim is bigger than a weekly walk. Each city can connect people who make, trade and collaborate using bitcoin, helping sats circulate between local participants and supporting resilient circular economies.</p><p>The shared brand makes every local effort part of a visible global movement. These guidelines protect that recognition while leaving room for local character, language, culture and commercial creativity.</p></div><div className={styles.principles}><span>Think globally</span><span>Create locally</span><span>Earn from value</span><span>Keep sats circulating</span></div></section>
 <section className={styles.section} id="logos"><div className={styles.sectionIntro}><p className={styles.eyebrow}>01 · Logos</p><h2>One family, two marks</h2><p>Use the traditional BitcoinWalk mark for the main organization. Use SatsMan as the lighter community and merchandise character. Keep both marks intact and give them room to breathe.</p></div>
  <div className={styles.logoGrid}>
   <article className={styles.logoCard}><div className={styles.logoLight}><Image src="/brand/bitcoinwalk-horizontal.png" width={2000} height={368} alt="BitcoinWalk horizontal logo"/></div><div><h3>Primary wordmark</h3><p>Preferred for headers, partnerships and formal applications.</p><a href="/brand/bitcoinwalk-horizontal.png" download>Download PNG</a></div></article>
   <article className={`${styles.logoCard} ${styles.darkCard}`}><div className={styles.logoDark}><Image src="/brand/bitcoinwalk-horizontal-white.png" width={2000} height={368} alt="White BitcoinWalk horizontal logo"/></div><div><h3>Reversed wordmark</h3><p>For dark photography and BitcoinWalk ink backgrounds.</p><a href="/brand/bitcoinwalk-horizontal-white.png" download>Download PNG</a></div></article>
   <article className={styles.logoCard}><div className={styles.markLight}><Image src="/brand/bitcoinwalk-icon.png" width={512} height={512} alt="Traditional BitcoinWalk mark"/></div><div><h3>Traditional mark</h3><p>The walking figure and Bitcoin symbol in the established orange roundel.</p><a href="/brand/bitcoinwalk-icon.png" download>Download PNG</a></div></article>
   <article className={styles.logoCard}><div className={styles.markLight}><Image src="/brand/satsman-ink.png" width={420} height={420} alt="SatsMan mark"/></div><div><h3>SatsMan</h3><p>The walking figure beside stacked satoshi bars, without the Bitcoin symbol.</p><a href="/brand/satsman-ink.png" download>Download PNG</a></div></article>
  </div>
  <div className={styles.variantIntro}><p className={styles.eyebrow}>City-neutral Inkscape system</p><h3>Symbols and standard logos</h3><p>Use these marks when no city name is required. The complete series includes round and standalone symbols plus horizontal and vertical BitcoinWalk logos. Each master opens in Inkscape, preserves the approved artwork exactly and is available as both PNG and SVG.</p></div>
  <div className={styles.variantGrid}>{globalVariants.map(variant=><article className={styles.variantCard} key={variant.file}><div className={variant.dark?styles.globalDark:styles.globalLight}><Image src={`/brand/inkscape/global/previews/${variant.file}.png`} width={1200} height={800} alt={`${variant.name} — ${variant.use.toLowerCase()}`}/></div><div><h4>{variant.name}</h4><p>{variant.use}</p><span className={styles.formatLinks}><a href={`/brand/inkscape/global/${variant.file}.png`} download>PNG</a><a href={`/brand/inkscape/global/${variant.file}.svg`} download>SVG</a></span></div></article>)}</div>
 </section>
 <section className={`${styles.section} ${styles.tint}`} id="colour"><div className={styles.sectionIntro}><p className={styles.eyebrow}>02 · Colour</p><h2>A working palette</h2><p>These colours reflect the current website and assets. This section is deliberately labelled working: exact production tokens can be refined without changing the core orange identity.</p></div><div className={styles.swatches}>{swatches.map(item=><div className={styles.swatch} key={item.value} style={{background:item.value,color:item.dark?"white":"#252824"}}><strong>{item.name}</strong><span>{item.value}</span></div>)}</div></section>
 <section className={styles.section} id="type"><div className={styles.sectionIntro}><p className={styles.eyebrow}>03 · Typography</p><h2>Friendly, direct, legible</h2></div><div className={styles.typeGrid}><article><span className={styles.typeSample}>BitcoinWalk</span><h3>Ubuntu Bold Italic</h3><p>Used in localized logo artwork and expressive brand moments.</p></article><article><span className={styles.uiSample}>Walk. Talk. Bitcoin.</span><h3>System sans</h3><p>The current product interface uses a familiar sans-serif stack for speed and readability. A final brand typeface can replace it later.</p></article></div></section>
 <section className={`${styles.section} ${styles.postcardCta}`}><div><p className={styles.eyebrow}>Postcard maker</p><h2>Put BitcoinWalk in the picture.</h2><p>Approved city organizers and the super-admin can turn their own photography into a downloadable BitcoinWalk postcard.</p></div><Link className={styles.postcardLink} href="/postcard">Open postcard maker</Link></section>
 <footer className={styles.footer}><Image src="/brand/bitcoinwalk-icon.png" width={64} height={64} alt=""/><p>Walk locally. Share globally.</p><Link href="/">Find a BitcoinWalk</Link></footer>
 </main>}
