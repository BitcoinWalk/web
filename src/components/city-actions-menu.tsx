"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import styles from "./city-moderation.module.css";

export default function CityActionsMenu({cityName,children}:{cityName:string;children:ReactNode}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const closeOutside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};
  document.addEventListener("pointerdown",closeOutside);document.addEventListener("keydown",closeOnEscape);
  requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus());
  return ()=>{document.removeEventListener("pointerdown",closeOutside);document.removeEventListener("keydown",closeOnEscape);};
 },[open]);
 function moveFocus(event:React.KeyboardEvent<HTMLDivElement>){
  if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  const items=[...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)")];if(!items.length)return;
  event.preventDefault();const current=items.indexOf(document.activeElement as HTMLElement);
  const index=event.key==="Home"?0:event.key==="End"?items.length-1:event.key==="ArrowDown"?(current+1)%items.length:(current<=0?items.length:current)-1;
  items[index]?.focus();
 }
 return <div className={styles.actionMenu} ref={root}>
  <button ref={trigger} className={styles.actionMenuTrigger} type="button" aria-label={`Actions for ${cityName}`} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
   <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="19" cy="12" r="1.75"/></svg>
  </button>
  {open&&<div className={styles.actionMenuPanel} role="menu" aria-label={`${cityName} actions`} onKeyDown={moveFocus} onClick={()=>setOpen(false)}>{children}</div>}
 </div>;
}
