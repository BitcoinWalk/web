"use client";

import {useEffect,useState,useSyncExternalStore} from "react";
import Image from "next/image";
import styles from "./pwa-lifecycle.module.css";

type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};

const subscribeOnline=(changed:()=>void)=>{window.addEventListener("online",changed);window.addEventListener("offline",changed);return()=>{window.removeEventListener("online",changed);window.removeEventListener("offline",changed);};};
const onlineSnapshot=()=>navigator.onLine;

export default function PwaLifecycle(){
 const online=useSyncExternalStore(subscribeOnline,onlineSnapshot,()=>true);
 const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  if(process.env.NODE_ENV!=="production"||!("serviceWorker" in navigator))return;
  const register=()=>void navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{});
  if(document.readyState==="complete")register();else window.addEventListener("load",register,{once:true});
  return()=>window.removeEventListener("load",register);
 },[]);
 useEffect(()=>{
  const install=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent);setDismissed(false);};
  const installed=()=>{setPrompt(null);setDismissed(true);};
  window.addEventListener("beforeinstallprompt",install);window.addEventListener("appinstalled",installed);
  return()=>{window.removeEventListener("beforeinstallprompt",install);window.removeEventListener("appinstalled",installed);};
 },[]);
 async function install(){if(!prompt)return;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")setPrompt(null);else setDismissed(true);}
 return <>
  {!online&&<aside className={styles.offline} role="status"><span aria-hidden="true"/>You’re offline. Read-only pages may be unavailable; nothing will be submitted until you reconnect.</aside>}
  {prompt&&!dismissed&&<aside className={styles.install} aria-labelledby="install-bitcoinwalk-title"><Image src="/pwa/icon-192.png" width={192} height={192} alt=""/><div><strong id="install-bitcoinwalk-title">Keep BitcoinWalk close</strong><span>Install this website for quicker access to walks and your dashboard.</span></div><button className={styles.primary} type="button" onClick={()=>void install()}>Install</button><button className={styles.dismiss} type="button" aria-label="Dismiss install suggestion" onClick={()=>setDismissed(true)}>×</button></aside>}
 </>;
}
