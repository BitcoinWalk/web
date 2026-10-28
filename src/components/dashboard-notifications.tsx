"use client";

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import styles from "./dashboard-notifications.module.css";

export type DashboardNotificationTone="success"|"warning"|"error";
export type DashboardNotificationInput={
 id?:string;
 tone:DashboardNotificationTone;
 title:string;
 message:string;
 action?:{label:string;run:()=>void};
};
export type DashboardNotification=DashboardNotificationInput&{id:string;createdAt:number};

const limit=4;
const fallback=()=>{};
const DashboardNotificationContext=createContext<(notice:DashboardNotificationInput)=>void>(fallback);

function generatedId(){return `dashboard-notice-${Date.now()}-${Math.random().toString(36).slice(2)}`;}

export function upsertDashboardNotification(current:DashboardNotification[],input:DashboardNotificationInput,now=Date.now()):DashboardNotification[]{
 const id=input.id??generatedId(),existing=current.find(item=>item.id===id);
 if(existing&&existing.tone===input.tone&&existing.title===input.title&&existing.message===input.message&&existing.action?.label===input.action?.label)return current;
 const next=[...current.filter(item=>item.id!==id),{...input,id,createdAt:now}];
 if(next.length<=limit)return next;
 const newestError=[...next].reverse().find(item=>item.tone==="error")?.id;
 while(next.length>limit){const removable=next.findIndex(item=>item.id!==newestError&&item.tone==="success");const warning=next.findIndex(item=>item.id!==newestError&&item.tone==="warning");const any=next.findIndex(item=>item.id!==newestError);next.splice(removable>=0?removable:warning>=0?warning:any>=0?any:0,1);}
 return next;
}

function NoticeIcon({tone}:{tone:DashboardNotificationTone}){
 if(tone==="success")return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4 4L19 7"/></svg>;
 if(tone==="warning")return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4.5M12 17h.01"/></svg>;
 return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>;
}

function NotificationCard({notice,onDismiss}:{notice:DashboardNotification;onDismiss:()=>void}){
 const [paused,setPaused]=useState(false);
 useEffect(()=>{if(notice.tone!=="success"||paused)return;const timer=window.setTimeout(onDismiss,7000);return()=>window.clearTimeout(timer);},[notice.tone,onDismiss,paused]);
 return <section className={styles.notice} data-tone={notice.tone} role={notice.tone==="error"?"alert":"status"} aria-live={notice.tone==="error"?"assertive":"polite"} aria-atomic="true" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setPaused(false);}}>
  <span className={styles.icon}><NoticeIcon tone={notice.tone}/></span>
  <div className={styles.copy}><strong>{notice.title}</strong><p>{notice.message}</p>{notice.action&&<button type="button" className={styles.action} onClick={()=>notice.action?.run()}>{notice.action.label}</button>}</div>
  <button type="button" className={styles.dismiss} aria-label={`Dismiss ${notice.title}`} onClick={onDismiss}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10m0-10L7 17"/></svg></button>
 </section>;
}

export function DashboardNotificationProvider({children}:{children:ReactNode}){
 const [notices,setNotices]=useState<DashboardNotification[]>([]);
 const notify=useCallback((notice:DashboardNotificationInput)=>setNotices(current=>upsertDashboardNotification(current,notice)),[]);
 const dismiss=useCallback((id:string)=>setNotices(current=>current.filter(item=>item.id!==id)),[]);
 const value=useMemo(()=>notify,[notify]);
 return <DashboardNotificationContext.Provider value={value}>{children}<aside className={styles.stack} aria-label="Dashboard notifications">{notices.map(notice=><NotificationCard key={notice.id} notice={notice} onDismiss={()=>dismiss(notice.id)}/>)}</aside></DashboardNotificationContext.Provider>;
}

export const useDashboardNotification=()=>useContext(DashboardNotificationContext);
