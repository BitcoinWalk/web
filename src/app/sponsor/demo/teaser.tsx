import styles from "./demo.module.css";

export default function SponsorshipTeaser(){
 return <aside className={styles.teaser} aria-label="Preview sponsorship before paying"><div><strong>See what you’re sponsoring.</strong><p>Your logo on the share image. Your identity on the walk page.</p></div><a href="/sponsor/demo" target="_blank" rel="noopener noreferrer">Explore the demo ↗ <small>(new tab)</small></a></aside>;
}
