"use client";

import {useLayoutEffect,useRef,useState,type ReactNode} from "react";
import styles from "./chat.module.css";

/** Remount with an account/room key; scroll and expansion never cross identities. */
export default function MessageHistory<T extends {id:string;createdAt:number}>({messages,label,latestRequest=0,loading=false,render}:{messages:T[];label:string;latestRequest?:number;loading?:boolean;render:(message:T)=>ReactNode}){
 const [startId,setStartId]=useState<string|null>(null),[newCount,setNewCount]=useState(0);
 const pane=useRef<HTMLUListElement>(null),following=useRef(true),known=useRef(new Set(messages.map(row=>row.id))),anchor=useRef<{id:string;offset:number}|null>(null);
 const newest=useRef(messages.at(-1)?.createdAt??0);
 const lastRequest=useRef(latestRequest);
 const boundary=startId?messages.findIndex(row=>row.id===startId):-1,start=boundary>=0?boundary:Math.max(0,messages.length-3),shown=messages.slice(start),hasOlder=start>0;
 function remember(){const list=pane.current;if(!list)return;const top=list.getBoundingClientRect().top;const row=[...list.querySelectorAll<HTMLElement>("[data-message-id]")].find(node=>node.getBoundingClientRect().bottom>top);anchor.current=row?{id:row.dataset.messageId!,offset:row.getBoundingClientRect().top-top}:null;}
 useLayoutEffect(()=>{
  const list=pane.current;if(!list)return;
  const added=messages.filter(row=>!known.current.has(row.id)&&row.createdAt>=newest.current);
  if(lastRequest.current!==latestRequest){lastRequest.current=latestRequest;following.current=true;setNewCount(0);}
  newest.current=Math.max(newest.current,messages.at(-1)?.createdAt??0);
  known.current=new Set(messages.map(row=>row.id));
  if(following.current){list.scrollTop=list.scrollHeight;}
  else if(anchor.current){const saved=anchor.current;const node=[...list.querySelectorAll<HTMLElement>("[data-message-id]")].find(row=>row.dataset.messageId===saved.id);if(node)list.scrollTop+=node.getBoundingClientRect().top-list.getBoundingClientRect().top-saved.offset;}
  if(added.length&&!following.current)setNewCount(value=>value+added.length);
 },[messages,startId,latestRequest]);
 function scroll(){const list=pane.current;if(!list)return;following.current=list.scrollHeight-list.scrollTop-list.clientHeight<40;if(following.current)setNewCount(0);else if(!startId&&shown[0])setStartId(shown[0].id);remember();}
 function older(){remember();following.current=false;pane.current?.focus({preventScroll:true});setStartId(messages[Math.max(0,start-20)]?.id??null);}
 function latest(){following.current=true;setNewCount(0);if(pane.current)pane.current.scrollTop=pane.current.scrollHeight;}
 return <>
  <ul ref={pane} className={styles.messages} tabIndex={0} aria-label={label} aria-busy={loading} onScroll={scroll} onLoad={()=>{if(following.current&&pane.current)pane.current.scrollTop=pane.current.scrollHeight;}}>
   {hasOlder&&<li className={styles.historyControl}><button type="button" onClick={older}>Load older messages</button></li>}
   {shown.map(message=><li className={styles.message} data-message-id={message.id} key={message.id}>{render(message)}</li>)}
   {!shown.length&&<li className={styles.empty}>No messages yet. Say hello.</li>}
  </ul>
  {newCount>0&&<button className={styles.newMessages} type="button" onClick={latest}>{newCount} new {newCount===1?"message":"messages"} ↓</button>}
 </>;
}
