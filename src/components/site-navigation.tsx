"use client";

import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect, useRef, useState} from "react";
import {ThemeToggle, useTheme} from "../design-system/theme-provider";
import styles from "./city-directory.module.css";

/** Fixed public shell: Silent Link proportions, BitcoinWalk assets and routes. */
export default function SiteNavigation({overImage=false,focused=false}:{overImage?:boolean;focused?:boolean}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const {theme} = useTheme();
  const path = usePathname();
  const links = [{href:"/app",label:"Download App"},{href:"/#find-walk",label:"Find a walk"},{href:"/start",label:"Start a walk"}];
  const logo = theme === "dark" ? "/brand/bitcoinwalk-horizontal-white.png" : "/brand/bitcoinwalk-horizontal.png";
  useEffect(() => {
    const update = () => setScrolled(window.scrollY >= (innerWidth <= 1100 ? 68 : 74));
    update(); window.addEventListener("scroll", update, {passive:true});
    const media = matchMedia("(max-width: 1100px)");
    const resize = () => menu.current?.close();
    media.addEventListener("change", resize);
    return () => {window.removeEventListener("scroll", update); media.removeEventListener("change", resize);};
  }, []);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {document.body.style.overflow = old;};
  }, [open]);
  return <>
    <nav className={styles.nav} data-over-image={overImage||undefined} data-photo-hero={path==="/"||undefined} data-compact={focused?false:scrolled} data-focused={focused||undefined} aria-label={focused?"BitcoinWalk":"Site navigation"}>
      <Link className={styles.brand} data-compact={focused?false:scrolled} href="/" aria-label="BitcoinWalk homepage"><span><Image className={`${styles.wordmark} ${styles.wordmarkLight}`} src="/brand/bitcoinwalk-horizontal.png" width={1690} height={312} priority alt="BitcoinWalk"/><Image className={`${styles.wordmark} ${styles.wordmarkDark}`} src="/brand/bitcoinwalk-horizontal-white.png" width={1690} height={312} priority alt="BitcoinWalk"/><Image className={styles.icon} src="/brand/bitcoinwalk-icon.png" width={48} height={48} alt=""/></span></Link>
      {!focused&&<div className={styles.navActions}>
        <div className={styles.desktopLinks}>{links.map(link => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>)}</div>
        <ThemeToggle/>
        <Link className={styles.connectLink} href="/admin" aria-label="Connect to your dashboard" title="Connect"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></Link>
        <button ref={trigger} type="button" className={styles.menuButton} aria-label="Open site menu" aria-haspopup="dialog" aria-expanded={open} aria-controls="site-menu" onClick={() => {menu.current?.showModal(); setOpen(true);}}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7h18M3 17h18"/></svg></button>
      </div>}
    </nav>
    {!focused&&<dialog ref={menu} id="site-menu" className={styles.siteMenu} aria-label="Site menu" onClose={() => {setOpen(false); trigger.current?.focus();}}>
      <div className={styles.menuHeader}><Link href="/" onClick={() => menu.current?.close()} aria-label="BitcoinWalk homepage"><Image src={logo} width={156} height={48} alt="BitcoinWalk" style={{objectFit:"contain"}}/></Link></div>
      <div className={styles.menuContent}><nav aria-label="Mobile site navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined} onClick={() => menu.current?.close()}>{link.label}</Link>)}<Link href="/admin" onClick={() => menu.current?.close()}>Your dashboard</Link></nav></div>
      <button type="button" className={styles.menuClose} aria-label="Close site menu" onClick={()=>menu.current?.close()}>×</button>
    </dialog>}
  </>;
}
