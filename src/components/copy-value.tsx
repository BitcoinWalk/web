"use client";

import {useEffect,useRef,useState} from "react";
import styles from "./copy-value.module.css";

export default function CopyValue({label,value,displayValue}:{label:string;value?:string;displayValue?:string}){
 const [feedback,setFeedback]=useState<""|"copied"|"failed">(""),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 if(!value)return <span className={styles.missing}>Not provided</span>;
 function resetAfterDelay(){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setFeedback(""),1800);}
 function copy(){void navigator.clipboard.writeText(value!).then(()=>{setFeedback("copied");resetAfterDelay();}).catch(()=>{setFeedback("failed");resetAfterDelay();});}
 const buttonText=feedback==="copied"?"✓ Copied":feedback==="failed"?"! Retry":"⧉";
 return <span className={styles.copyValue}><span dir="auto">{displayValue??value}</span><button className={styles.copy} data-feedback={feedback||undefined} type="button" title={feedback==="copied"?`${label} copied`:`Copy ${label}`} aria-label={feedback==="copied"?`${label} copied to clipboard`:feedback==="failed"?`Copy ${label} failed; retry`:`Copy ${label}`} aria-live="polite" onClick={copy}>{buttonText}</button></span>;
}
