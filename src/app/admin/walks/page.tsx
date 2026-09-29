"use client";
import {useEffect,useState} from "react";
import OrganizerEvents from "../../organizer/events/_screen";
import EventModerationPanel from "../../../components/event-moderation";
import {useDashboard} from "../../../components/dashboard-context";

type WalkTab="schedule"|"moderation";
export function walkTabFromLocation(search:string,canModerate=true):WalkTab{
 const value=new URLSearchParams(search).get("tab");
 return value==="moderation"&&canModerate?"moderation":"schedule";
}
export default function WalksPage(){
 const dashboard=useDashboard(),canModerate=dashboard.role==="super-admin";
 const [tab,setTab]=useState<WalkTab>("schedule");
 useEffect(()=>{const sync=()=>setTab(walkTabFromLocation(window.location.search,canModerate));sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[canModerate]);
 function select(next:WalkTab){const url=new URL(window.location.href);if(next==="schedule")url.searchParams.delete("tab");else url.searchParams.set("tab",next);window.history.replaceState(null,"",url);setTab(next);}
 return <main><h1>Walks</h1>{canModerate&&<div role="tablist" aria-label="Walk administration"><button type="button" role="tab" aria-selected={tab==="schedule"} onClick={()=>select("schedule")}>Schedule and manage walks</button><button type="button" role="tab" aria-selected={tab==="moderation"} onClick={()=>select("moderation")}>Moderation and suspension</button></div>}<div role="tabpanel">{tab==="moderation"&&canModerate?<EventModerationPanel/>:<OrganizerEvents/>}</div></main>;
}
