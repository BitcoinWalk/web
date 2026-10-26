"use client";
import {useEffect,useId,useRef,useState} from "react";
import type {PlaceSearchResult} from "../lib/geocode";
import styles from "./meeting-place-search.module.css";
import ui from "../design-system/primitives.module.css";
type MeetingPlace=PlaceSearchResult&{address:string};

export default function MeetingPlaceSearch({city,onSelect}:{city:string;latitude:number;longitude:number;onSelect:(place:MeetingPlace)=>void}){
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<MeetingPlace[]>([]);
  const [message,setMessage]=useState("");
  const [open,setOpen]=useState(false),[index,setIndex]=useState(-1);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const composing=useRef(false),id=useId();
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(!open||query.trim().length<3||query===selected)return;
    const abort=new AbortController();
    const timer=setTimeout(async()=>{
      setMessage("Searching meeting places…");
      try{
        const params=new URLSearchParams({q:`${query.trim()}, ${city}`});
        const response=await fetch(`/api/geocode/places?${params}`,{signal:abort.signal});
        const data=await response.json();
        if(abort.signal.aborted)return;
        if(!response.ok)throw new Error(data.error||"Search is unavailable. Use the map or coordinates.");
        if(abort.signal.aborted)return;
        setResults(data.results.map((place:{name:string;latitude:number;longitude:number})=>({...place,address:place.name})));setIndex(-1);setMessage(data.results.length?"":"No places found. Try a street address, or use the map.");
      }catch(error){if(!abort.signal.aborted){setResults([]);setMessage(error instanceof Error?error.message:"Search is unavailable.");}}
      finally{if(!abort.signal.aborted)setBusy(false);}
    },550);
    return()=>{clearTimeout(timer);abort.abort();};
  },[query,open,selected,city]);
  function choose(place:MeetingPlace){setBusy(false);setQuery(place.name);setSelected(place.name);setOpen(false);setResults([]);setMessage("");onSelect(place);inputRef.current?.blur();}
  const expanded=open&&results.length>0;
  return <div className={styles.search}>
    <span className={styles.inputWrap}><input ref={inputRef} id={id} aria-label="Search for a meeting place" aria-busy={busy} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`} aria-activedescendant={expanded&&index>=0?`${id}-option-${index}`:undefined} autoComplete="off" placeholder={`Place or address in ${city}`} value={query} maxLength={160}
      onChange={event=>{setBusy(!composing.current&&event.target.value.trim().length>=3&&event.target.value!==selected);setQuery(event.target.value);setResults([]);setIndex(-1);setMessage("");setOpen(!composing.current);}}
      onFocus={()=>{setOpen(true);setBusy(query.trim().length>=3&&query!==selected);}} onBlur={()=>{setOpen(false);setBusy(false);}}
      onCompositionStart={()=>{composing.current=true;setBusy(false);setOpen(false);}} onCompositionEnd={()=>{composing.current=false;setBusy(query.trim().length>=3&&query!==selected);setOpen(true);}}
      onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==="Escape"){setOpen(false);}else if(event.key==="ArrowDown"&&results.length){event.preventDefault();setOpen(true);setIndex(value=>Math.min(value+1,results.length-1));}else if(event.key==="ArrowUp"&&results.length){event.preventDefault();setIndex(value=>Math.max(value-1,0));}else if(event.key==="Enter"){event.preventDefault();if(expanded)choose(results[Math.max(index,0)]);}}}/>{busy&&<span className={ui.searchSpinner} aria-hidden="true"/>}</span>
    <ul id={`${id}-results`} role="listbox" aria-label="Meeting place suggestions" hidden={!expanded} className={styles.results}>
      {results.map((place,i)=><li id={`${id}-option-${i}`} key={`${place.address}:${place.latitude}:${place.longitude}`} role="option" aria-selected={index===i} onPointerDown={event=>{event.preventDefault();}} onClick={()=>choose(place)}><strong>{place.name}</strong><small>{place.address}</small></li>)}
    </ul>
    {message&&<p role="status" className={styles.message}>{message}</p>}
  </div>;
}
