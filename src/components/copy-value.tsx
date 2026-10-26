"use client";

import {useEffect,useRef,useState} from "react";
import styles from "./copy-value.module.css";

export default function CopyValue({label,value,displayValue}:{label:string;value?:string;displayValue?:string}){
 const [feedback,setFeedback]=useState<""|"copied"|"failed">(""),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 if(!value)return <span className={styles.missing}>Not provided</span>;
 function resetAfterDelay(){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setFeedback(""),1800);}
 function copy(){void navigator.clipboard.writeText(value!).then(()=>{setFeedback("copied");resetAfterDelay();}).catch(()=>{setFeedback("failed");resetAfterDelay();});}
 const buttonText=feedback==="copied"?"✓ Copied":feedback==="failed"?"! Retry":<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/></svg>;
 return <span className={styles.copyValue}><span dir="auto">{displayValue??value}</span><button className={styles.copy} data-feedback={feedback||undefined} type="button" title={feedback==="copied"?`${label} copied`:`Copy ${label}`} aria-label={feedback==="copied"?`${label} copied to clipboard`:feedback==="failed"?`Copy ${label} failed; retry`:`Copy ${label}`} aria-live="polite" onClick={copy}>{buttonText}</button></span>;
}
