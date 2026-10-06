"use client";

import {useEffect} from "react";
import CityModeration from "../../../components/city-moderation";
export function movedCityTabHref(search:string,hash=""):string|null{
  const params=new URLSearchParams(search),value=params.get("tab");
  if(value==="requests"||/^#submission-[0-9a-f]{64}$/.test(hash)){params.delete("tab");const query=params.toString();return `/admin/requests${query?`?${query}`:""}`;}
  if(value!=="editors"&&value!=="moderation")return null;
  if(value==="editors"){params.set("tab","editors");return `/admin/organizers?${params.toString()}`;}
  params.delete("tab");
  const query=params.toString();return `/admin/cities${query?`?${query}`:""}`;
}

export default function CitiesPage(){
  useEffect(()=>{
    const redirectMovedTools=()=>{
      const moved=movedCityTabHref(window.location.search,window.location.hash);
      if(moved){window.location.replace(`${moved}${window.location.hash}`);return;}
    };
    redirectMovedTools();
    window.addEventListener("popstate",redirectMovedTools);
    window.addEventListener("hashchange",redirectMovedTools);
    return()=>{window.removeEventListener("popstate",redirectMovedTools);window.removeEventListener("hashchange",redirectMovedTools);};
  },[]);
  return <CityModeration/>;
}
