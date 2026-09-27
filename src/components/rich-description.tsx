"use client";
import {useRef,useState} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function RichDescriptionEditor({value,onChange,label="Walk description",disabled=false}:{value:string;onChange:(value:string)=>void;label?:string;disabled?:boolean}){
 const area=useRef<HTMLTextAreaElement>(null),[preview,setPreview]=useState(false);
 function wrap(before:string,after=before,placeholder="text"){const field=area.current;if(!field||disabled)return;const start=field.selectionStart,end=field.selectionEnd,selected=value.slice(start,end)||placeholder,next=value.slice(0,start)+before+selected+after+value.slice(end);onChange(next);requestAnimationFrame(()=>{field.focus();field.setSelectionRange(start+before.length,start+before.length+selected.length);});}
 function line(prefix:string){const field=area.current;if(!field||disabled)return;const start=field.selectionStart,lineStart=value.lastIndexOf("\n",start-1)+1,onLine=value.slice(lineStart).startsWith(prefix),next=value.slice(0,lineStart)+(onLine?"":prefix)+value.slice(lineStart+(onLine?prefix.length:0));onChange(next);requestAnimationFrame(()=>field.focus());}
 return <section className="rich-description"><label>{label}<textarea ref={area} value={value} disabled={disabled} maxLength={5000} required onChange={event=>onChange(event.target.value)}/></label><div className="rich-description__toolbar" role="toolbar" aria-label={`${label} formatting`}><button type="button" disabled={disabled} onClick={()=>wrap("**")}>Bold</button><button type="button" disabled={disabled} onClick={()=>wrap("_")}>Italic</button><button type="button" disabled={disabled} onClick={()=>line("## ")}>Heading</button><button type="button" disabled={disabled} onClick={()=>line("- ")}>List</button><button type="button" disabled={disabled} onClick={()=>wrap("[","](https://)","link text")}>Link</button><button type="button" disabled={disabled} aria-pressed={preview} onClick={()=>setPreview(show=>!show)}>{preview?"Hide preview":"Preview"}</button></div>{preview&&<div className="rich-description__preview"><MarkdownDescription value={value}/></div>}<small>Formatting is saved as portable Markdown. Raw HTML is not rendered.</small></section>;
}

export function MarkdownDescription({value}:{value:string}){return <div className="walk-description"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:props=><a {...props} target="_blank" rel="noopener noreferrer"/>}}>{value}</ReactMarkdown></div>;}
