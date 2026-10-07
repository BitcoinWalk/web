import Link from "next/link";
import Image from "next/image";
import {notFound,redirect} from "next/navigation";
import type {Metadata} from "next";
import {loadPublishedLogoPack} from "../../../logos/serving";
import styles from "./page.module.css";
import {loadSharedCities} from "../../../server/share-preview";
import {resolveCityRoute} from "../../../domain/city-route";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}:{params:Promise<{city:string}>}):Promise<Metadata>{
  try{const pack=await loadPublishedLogoPack((await params).city);return {robots:pack?.publiclyListed?{index:true,follow:true}:{index:false,follow:false}};}catch{return {robots:{index:false,follow:false}};}
}

export default async function CityLogoPage({params}: {params: Promise<{city: string}>}) {
  const {city} = await params;
  const route=resolveCityRoute(await loadSharedCities(),city);if(route?.redirect)redirect(`/${encodeURIComponent(route.canonicalSlug)}/logo`);
  const pack = await loadPublishedLogoPack(route?.canonicalSlug??city);
  if (!pack) notFound();
  const base = `/api/city-logos/${pack.jobKey}/`;
  return <main className={styles.page}>
    <Link href="/" className={styles.brand}>BitcoinWalk</Link>
    <h1>{pack.cityName} logo pack</h1>
    <p>Official BitcoinWalk city artwork. Approved Basic and Pro cities can download their completed pack directly—no account required.</p>
    <p><a className={styles.download} href={base + pack.manifest.archive.name} download>Download all {pack.manifest.files.length} logos (ZIP)</a></p>
    <p>PNG variants for light and dark backgrounds. Choose the version suited to your background; some source artwork includes an opaque background.</p>
    <div className={styles.grid}>{pack.manifest.files.map(file => <article className={styles.card} key={file.name}>
      <div className={file.background === "dark" ? styles.dark : styles.light}>
        <Image unoptimized src={base + file.name} width={file.width} height={file.height} alt={`BitcoinWalk ${pack.cityName} — ${file.label}`} />
      </div>
      <h2>{file.label}</h2>
      <p>{file.width} × {file.height} px · PNG</p>
      <a href={base + file.name} download>Download PNG<span className={styles.srOnly}> — {file.label}</span></a>
    </article>)}</div>
    <section><h2>Keep the brand consistent</h2><p>Keep the original proportions, colours and spacing. Do not stretch, recolour, crop the symbol or replace the lettering.</p></section>
    <p><a href={base + "manifest.json"} download>Download pack manifest and checksums</a></p>
    <p><Link href={`/${pack.slug}`}>Back to BitcoinWalk {pack.cityName}</Link></p>
  </main>;
}
