"use client";
import dynamic from "next/dynamic";
import {useEffect,useRef,useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const VisualDescription=dynamic(()=>import("./visual-description"),{ssr:false,loading:()=> <p role="status">Loading text editor…</p>});
type EditorProps={value:string;onChange:(value:string)=>void;label?:string;disabled?:boolean;placeholder?:string;previewFirst?:boolean};
function DeferredDescription(props:EditorProps){
 const host=useRef<HTMLDivElement>(null),[ready,setReady]=useState(false);
 useEffect(()=>{if(!host.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setReady(true);observer.disconnect();}});observer.observe(host.current);return()=>observer.disconnect();},[]);
 return <div ref={host}>{ready?<VisualDescription {...props} label={props.label??"Walk description"} disabled={props.disabled??false}/>:<><p>{props.label??"Walk description"}</p><MarkdownDescription value={props.value}/></>}</div>;
}

export function RichDescriptionEditor({value,onChange,label="Walk description",disabled=false,placeholder,previewFirst=false}:EditorProps){
 const area=useRef<HTMLTextAreaElement>(null),[preview,setPreview]=useState(false);
 function wrap(before:string,after=before,placeholder="text"){const field=area.current;if(!field||disabled)return;const start=field.selectionStart,end=field.selectionEnd,selected=value.slice(start,end)||placeholder,next=value.slice(0,start)+before+selected+after+value.slice(end);onChange(next);requestAnimationFrame(()=>{field.focus();field.setSelectionRange(start+before.length,start+before.length+selected.length);});}
 function line(prefix:string){const field=area.current;if(!field||disabled)return;const start=field.selectionStart,lineStart=value.lastIndexOf("\n",start-1)+1,onLine=value.slice(lineStart).startsWith(prefix),next=value.slice(0,lineStart)+(onLine?"":prefix)+value.slice(lineStart+(onLine?prefix.length:0));onChange(next);requestAnimationFrame(()=>field.focus());}
 if(previewFirst)return <DeferredDescription value={value} onChange={onChange} label={label} disabled={disabled} placeholder={placeholder}/>;
 return <section className="rich-description"><label>{label}<textarea ref={area} placeholder={placeholder} value={value} disabled={disabled} maxLength={5000} required onChange={event=>onChange(event.target.value)}/></label><div className="rich-description__toolbar" role="toolbar" aria-label={`${label} formatting`}><button type="button" disabled={disabled} onClick={()=>wrap("**")}>Bold</button><button type="button" disabled={disabled} onClick={()=>wrap("_")}>Italic</button><button type="button" disabled={disabled} onClick={()=>line("## ")}>Heading</button><button type="button" disabled={disabled} onClick={()=>line("- ")}>List</button><button type="button" disabled={disabled} onClick={()=>wrap("[","](https://)","link text")}>Link</button><button type="button" disabled={disabled} aria-pressed={preview} onClick={()=>setPreview(show=>!show)}>{preview?"Hide preview":"Preview"}</button></div>{preview&&<div className="rich-description__preview"><MarkdownDescription value={value}/></div>}<small>Formatting is saved as portable Markdown. Raw HTML is not rendered.</small></section>;
}

export function MarkdownDescription({value}:{value:string}){return <div className="walk-description"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:props=><a {...props} target="_blank" rel="noopener noreferrer"/>}}>{value}</ReactMarkdown></div>;}
