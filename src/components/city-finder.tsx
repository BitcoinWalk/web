"use client";
import {useId,useMemo,useRef,useState,type KeyboardEvent} from "react";
import styles from "./city-finder.module.css";

export type CityFinderItem={id:string;name:string;meta?:string;keywords?:string[]};

function searchable(value:string){return value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase().trim();}
export function filterCityFinderItems(items:CityFinderItem[],query:string):CityFinderItem[]{
 const words=searchable(query).split(/\s+/).filter(Boolean);
 if(!words.length)return items;
 return items.filter(item=>{const haystack=searchable([item.name,...(item.keywords??[])].join(" ")),meta=searchable(item.meta??"");return words.every(word=>haystack.includes(word)||meta===word);});
}

export default function CityFinder({items,value,onChange,disabled=false,label="City",placeholder="Search cities…"}:{items:CityFinderItem[];value:string;onChange:(id:string)=>void;disabled?:boolean;label?:string;placeholder?:string}){
 const selected=items.find(item=>item.id===value),[query,setQuery]=useState(selected?.name??""),[open,setOpen]=useState(false),[active,setActive]=useState(0),input=useRef<HTMLInputElement>(null);
 const uid=useId().replace(/:/g,""),inputId=`city-finder-input-${uid}`,resultsId=`city-finder-results-${uid}`;
 const matches=useMemo(()=>filterCityFinderItems(items,query),[items,query]);
 const activeIndex=Math.min(active,Math.max(0,matches.length-1));
 function choose(item:CityFinderItem){onChange(item.id);setQuery(item.name);setOpen(false);setActive(0);}
 function keyDown(event:KeyboardEvent<HTMLInputElement>){
  if(event.key==="ArrowDown"){event.preventDefault();setOpen(true);setActive(index=>Math.min(index+1,Math.max(0,matches.length-1)));}
  else if(event.key==="ArrowUp"){event.preventDefault();setOpen(true);setActive(index=>Math.max(0,index-1));}
  else if(event.key==="Enter"&&open&&matches[activeIndex]){event.preventDefault();choose(matches[activeIndex]);}
  else if(event.key==="Escape")setOpen(false);
 }
 return <div className={styles.finder}>
  <label htmlFor={inputId}>{label}</label>
  <div className={styles.control}>
   <input ref={input} id={inputId} type="search" role="combobox" autoComplete="off" disabled={disabled} placeholder={placeholder} value={open?query:selected?.name??""} aria-expanded={open} aria-controls={resultsId} aria-activedescendant={open&&matches[activeIndex]?`${resultsId}-${matches[activeIndex].id}`:undefined} onFocus={()=>{setQuery("");setOpen(true);setActive(0);}} onBlur={()=>setOpen(false)} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(0);}} onKeyDown={keyDown}/>
   {value&&<button type="button" className={styles.clear} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange("");setQuery("");setOpen(true);input.current?.focus();}} aria-label="Clear selected city">×</button>}
  </div>
  {open&&<div className={styles.results} id={resultsId} role="listbox" aria-label="Cities">
   <p>{matches.length} of {items.length} {items.length===1?"city":"cities"}</p>
   {!matches.length?<p>No matching cities. Try another name.</p>:matches.map((item,index)=><button type="button" role="option" id={`${resultsId}-${item.id}`} aria-selected={item.id===value} data-active={index===activeIndex} key={item.id} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}><strong>{item.name}</strong>{item.meta&&<span>{item.meta}</span>}</button>)}
  </div>}
 </div>;
}
