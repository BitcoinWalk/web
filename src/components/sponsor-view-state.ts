"use client";
import {useCallback,useEffect,useState} from "react";

export function sponsorViewUrl(href:string,name:string,value:string,fallback=""){
 const url=new URL(href);
 if(!value||value===fallback)url.searchParams.delete(name);else url.searchParams.set(name,value);
 return `${url.pathname}${url.search}${url.hash}`;
}

function current(name:string){return typeof window==="undefined"?"":new URL(window.location.href).searchParams.get(name)??"";}
const acceptAny=()=>true;

export function useSponsorChoice<const T extends string>(name:string,values:readonly T[],fallback:T){
 const [value,setValue]=useState<T>(fallback);
 useEffect(()=>{const read=()=>{const candidate=current(name);setValue(values.includes(candidate as T)?candidate as T:fallback);};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read);},[name,values,fallback]);
 const update=useCallback((next:T)=>{setValue(next);window.history.pushState(null,"",sponsorViewUrl(window.location.href,name,next,fallback));},[name,fallback]);
 return [value,update] as const;
}

export function useSponsorText(name:string,{maximum=160,accept=acceptAny,history="push"}:{maximum?:number;accept?:(value:string)=>boolean;history?:"push"|"replace"}={}){
 const [value,setValue]=useState("");
 useEffect(()=>{const read=()=>{const candidate=current(name);setValue(candidate.length<=maximum&&accept(candidate)?candidate:"");};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read);},[name,maximum,accept]);
 const update=useCallback((next:string)=>{const safe=next.slice(0,maximum);setValue(safe);window.history[history==="replace"?"replaceState":"pushState"](null,"",sponsorViewUrl(window.location.href,name,safe));},[name,maximum,history]);
 return [value,update] as const;
}
