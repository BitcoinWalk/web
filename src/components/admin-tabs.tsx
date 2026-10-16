"use client";
import {useId,useRef,type KeyboardEvent, type ReactNode} from "react";
import styles from "./admin-tabs.module.css";

export type AdminTab<T extends string>={id:T;label:string;count?:number};
export function nextTabIndex(current:number,key:string,length:number){if(!length)return -1;if(key==="Home")return 0;if(key==="End")return length-1;if(key==="ArrowRight")return (current+1)%length;if(key==="ArrowLeft")return (current-1+length)%length;return current;}
export default function AdminTabs<T extends string>({tabs,value,onChange,label,disabled=false,idPrefix}:{tabs:AdminTab<T>[];value:T;onChange:(value:T)=>void;label:string;disabled?:boolean;idPrefix?:string}){
 const generated=useId().replace(/:/g,""),uid=idPrefix??generated,buttons=useRef<(HTMLButtonElement|null)[]>([]),current=Math.max(0,tabs.findIndex(tab=>tab.id===value));
 function keyDown(event:KeyboardEvent<HTMLDivElement>){if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;event.preventDefault();const next=nextTabIndex(current,event.key,tabs.length),tab=tabs[next];if(!tab)return;onChange(tab.id);buttons.current[next]?.focus();}
 return <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={keyDown}>{tabs.map((tab,index)=><button ref={node=>{buttons.current[index]=node;}} key={tab.id} id={`admin-tab-${uid}-${tab.id}`} type="button" role="tab" aria-selected={tab.id===value} aria-controls={`admin-panel-${uid}-${tab.id}`} tabIndex={tab.id===value?0:-1} disabled={disabled} onClick={()=>onChange(tab.id)}>{tab.label}{tab.count!==undefined&&<span>{tab.count}</span>}</button>)}</div>;
}

export function AdminTabPanel({idPrefix,value,children}:{idPrefix:string;value:string;children?:ReactNode}){return <div id={`admin-panel-${idPrefix}-${value}`} role="tabpanel" aria-labelledby={`admin-tab-${idPrefix}-${value}`} tabIndex={0}>{children}</div>;}
