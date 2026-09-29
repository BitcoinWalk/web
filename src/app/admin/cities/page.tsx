"use client";

import {useEffect,useState} from "react";
import CityModeration from "../../../components/city-moderation";
import SubmissionApprovals from "../_approvals-screen";
import CityProfile from "../../organizer/_screen";

type CityTab="manage"|"requests"|"profile";
const tabs:{id:CityTab;label:string}[]=[
  {id:"manage",label:"City list"},
  {id:"requests",label:"Review requests"},
  {id:"profile",label:"Edit city"},
];
export function cityTabFromLocation(search:string,hash:string):CityTab{
  if(/^#submission-[0-9a-f]{64}$/.test(hash))return "requests";
  const value=new URLSearchParams(search).get("tab");
  return tabs.some(tab=>tab.id===value)?value as CityTab:"manage";
}
export function movedCityTabHref(search:string):string|null{
  const params=new URLSearchParams(search),value=params.get("tab");
  if(value!=="editors"&&value!=="moderation")return null;
  const path=value==="editors"?"/admin/organizers":"/admin/walks";
  params.set("tab",value==="editors"?"editors":"moderation");
  return `${path}?${params.toString()}`;
}

export default function CitiesPage(){
  const [tab,setTab]=useState<CityTab|null>(null);
  useEffect(()=>{
    const sync=()=>{
      const moved=movedCityTabHref(window.location.search);
      if(moved){window.location.replace(`${moved}${window.location.hash}`);return;}
      setTab(cityTabFromLocation(window.location.search,window.location.hash));
    };
    sync();
    window.addEventListener("popstate",sync);
    window.addEventListener("hashchange",sync);
    return()=>{window.removeEventListener("popstate",sync);window.removeEventListener("hashchange",sync);};
  },[]);
  function select(next:CityTab){
    const url=new URL(window.location.href);
    url.searchParams.set("tab",next);
    url.hash="";
    window.history.replaceState(null,"",url);
    setTab(next);
  }
  return <main>
    <h1>Cities</h1>
    <div role="tablist" aria-label="City administration" style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {tabs.map(item=><button key={item.id} type="button" role="tab" id={`city-tab-${item.id}`} aria-controls="city-panel" aria-selected={tab===item.id} style={{background:tab===item.id?"#f7931a":undefined,fontWeight:tab===item.id?700:undefined}} onClick={()=>select(item.id)}>{item.label}</button>)}
    </div>
    {tab&&<div role="tabpanel" id="city-panel" aria-labelledby={`city-tab-${tab}`}>
      {tab==="manage"?<CityModeration/>:tab==="requests"?<SubmissionApprovals/>:<CityProfile/>}
    </div>}
  </main>;
}
