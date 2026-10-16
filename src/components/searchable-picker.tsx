"use client";
import {useEffect,useId,useMemo,useRef,useState,type KeyboardEvent} from "react";
import styles from "./searchable-picker.module.css";

export type SearchablePickerItem={id:string;name:string;meta?:string;keywords?:string[]};
export type SearchablePickerState="ready"|"loading"|"error";

function searchable(value:string){return value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase().trim();}
export function filterSearchablePickerItems(items:SearchablePickerItem[],query:string):SearchablePickerItem[]{
 const words=searchable(query).split(/\s+/).filter(Boolean);
 if(!words.length)return items;
 return items.filter(item=>{const haystack=searchable([item.name,...(item.keywords??[])].join(" ")),meta=searchable(item.meta??"");return words.every(word=>haystack.includes(word)||meta===word);});
}

export function nextPickerIndex(current:number,key:string,length:number):number{
 if(!length)return -1;
 if(key==="Home")return 0;
 if(key==="End")return length-1;
 if(key==="ArrowDown")return current<0?0:Math.min(current+1,length-1);
 if(key==="ArrowUp")return current<0?length-1:Math.max(0,current-1);
 return current;
}

export default function SearchablePicker({items,value,onChange,disabled=false,label,placeholder,state="ready",errorMessage,onRetry,listLabel="Options",singular="option",plural="options",clearLabel=`Clear selected ${singular}`,emptyMessage=`No matching ${plural}. Try another search.`}:{items:SearchablePickerItem[];value:string;onChange:(id:string)=>boolean|void;disabled?:boolean;label:string;placeholder:string;state?:SearchablePickerState;errorMessage?:string;onRetry?:()=>void;listLabel?:string;singular?:string;plural?:string;clearLabel?:string;emptyMessage?:string}){
 const selected=items.find(item=>item.id===value),[query,setQuery]=useState(selected?.name??""),[open,setOpen]=useState(false),[active,setActive]=useState(-1),input=useRef<HTMLInputElement>(null),results=useRef<HTMLDivElement>(null);
 const uid=useId().replace(/:/g,""),inputId=`picker-input-${uid}`,resultsId=`picker-results-${uid}`;
 const matches=useMemo(()=>filterSearchablePickerItems(items,query),[items,query]);
 const activeIndex=active>=0&&active<matches.length?active:-1;
 useEffect(()=>{if(activeIndex<0)return;results.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({block:"nearest"});},[activeIndex]);
 function choose(item:SearchablePickerItem){if(onChange(item.id)===false)return;setQuery(item.name);setOpen(false);setActive(-1);}
 function keyDown(event:KeyboardEvent<HTMLInputElement>){
  if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();setOpen(true);setActive(index=>nextPickerIndex(index,event.key,matches.length));}
  else if(event.key==="Enter"&&open&&activeIndex>=0){event.preventDefault();choose(matches[activeIndex]);}
  else if(event.key==="Escape"){setOpen(false);setActive(-1);}
 }
 return <div className={styles.picker} data-state={state}>
  <label htmlFor={inputId}>{label}</label>
  <div className={styles.control}>
   <input ref={input} id={inputId} type="search" role="combobox" autoComplete="off" disabled={disabled||state==="loading"} placeholder={placeholder} value={open?query:selected?.name??""} aria-expanded={open} aria-controls={resultsId} aria-autocomplete="list" aria-activedescendant={open&&activeIndex>=0?`${resultsId}-${activeIndex}`:undefined} onFocus={()=>{setQuery("");setOpen(true);setActive(-1);}} onBlur={()=>{setOpen(false);setActive(-1);}} onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);}} onKeyDown={keyDown}/>
   {value&&<button type="button" className={styles.clear} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(onChange("")===false)return;setQuery("");setOpen(true);setActive(-1);input.current?.focus();}} aria-label={clearLabel}>×</button>}
  </div>
  {open&&<div ref={results} className={styles.results} id={resultsId} role="listbox" aria-label={listLabel}>
   {state==="loading"?<p role="status">Loading {plural}…</p>:state==="error"?<div className={styles.error} role="alert"><p>{errorMessage??`Could not load ${plural}.`}</p>{onRetry&&<button type="button" onMouseDown={event=>event.preventDefault()} onClick={onRetry}>Retry</button>}</div>:<><p>{matches.length} of {items.length} {items.length===1?singular:plural}</p>{!matches.length?<p>{emptyMessage}</p>:matches.map((item,index)=><button type="button" role="option" id={`${resultsId}-${index}`} data-option-index={index} aria-selected={item.id===value} data-active={index===activeIndex} key={item.id} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}><strong>{item.name}</strong>{item.meta&&<span>{item.meta}</span>}</button>)}</>}
  </div>}
 </div>;
}
