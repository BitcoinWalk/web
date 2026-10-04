import Link from "next/link";
import type {ReactNode} from "react";
import styles from "./monitoring.module.css";
export default function MonitoringLayout({children}:{children:ReactNode}){return <><nav className={styles.tabs} aria-label="Monitoring views"><Link href="/admin/monitoring/alerts">Alerts</Link><Link href="/admin/monitoring/relays">Relays</Link></nav>{children}</>;}
