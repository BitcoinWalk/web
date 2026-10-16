import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from "react";
import styles from "./admin-ui.module.css";

export function AdminPageHeader({title,description,actions,eyebrow}:{title:string;description?:ReactNode;actions?:ReactNode;eyebrow?:string}){return <header className={styles.header}>{eyebrow&&<p className={styles.eyebrow}>{eyebrow}</p>}<div><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className={styles.actions}>{actions}</div>}</div></header>;}

export function AdminButton({variant="secondary",className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"danger"|"ghost"}){return <button {...props} className={`${styles.button} ${styles[variant]} ${className}`.trim()}/>;}

export function AdminFeedback({tone="info",children,className="",...props}:HTMLAttributes<HTMLParagraphElement>&{tone?:"info"|"success"|"warning"|"error"}){return <p {...props} className={`${styles.feedback} ${styles[tone]} ${className}`.trim()} role={tone==="error"?"alert":"status"} aria-live={tone==="error"?"assertive":"polite"}>{children}</p>;}

export function AdminStatusBadge({tone="neutral",children}:{tone?:"neutral"|"success"|"warning"|"danger"|"info";children?:ReactNode}){return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;}
