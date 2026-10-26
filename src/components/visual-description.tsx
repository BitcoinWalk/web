"use client";
import {useEffect,useId,useRef,useState} from "react";
import {EditorContent,useEditor,useEditorState} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {Markdown} from "@tiptap/markdown";
import {MarkdownDescription} from "./rich-description";
import styles from "./rich-description.module.css";

// Keep less common source constructs intact instead of silently discarding them.
const needsSource=(text:string)=>/!\[|^\s*\|.*\||^\s*[-*+]\s+\[[ xX]\]|^\s*\[[^\]]+\]:|<\/?[a-z][^>]*>/m.test(text);
export default function VisualDescription({value,onChange,label,disabled,placeholder}:{value:string;onChange:(value:string)=>void;label:string;disabled:boolean;placeholder?:string}){
  const [source,setSource]=useState(false),[message,setMessage]=useState("");
  const [linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState("");
  const area=useRef<HTMLTextAreaElement>(null),saved=useRef(value),id=useId();
  const unsupported=needsSource(value);
  const editor=useEditor({
    extensions:[StarterKit.configure({underline:false,link:{openOnClick:false}}),Markdown],
    immediatelyRender:false,content:value,contentType:"markdown",editable:!disabled&&!unsupported,
    editorProps:{attributes:{role:"textbox","aria-multiline":"true","aria-labelledby":`${id}-label`,"data-placeholder":placeholder??"Describe your walk…"}},
    onUpdate:({editor})=>{
      const next=editor.getMarkdown();
      if(next.length>5000){editor.commands.setContent(saved.current,{contentType:"markdown",emitUpdate:false});setMessage("Keep the description under 5,000 characters.");return;}
      saved.current=next;setMessage("");onChange(next);
    },
  });
  const active=useEditorState({editor,selector:({editor})=>({empty:editor?.isEmpty??true,bold:editor?.isActive("bold")??false,italic:editor?.isActive("italic")??false,heading:editor?.isActive("heading")??false,list:editor?.isActive("bulletList")??false,link:editor?.isActive("link")??false})});
  useEffect(()=>{if(editor&&value!==saved.current){saved.current=value;editor.commands.setContent(value,{contentType:"markdown",emitUpdate:false});}},[editor,value]);
  useEffect(()=>{editor?.setEditable(!disabled&&!unsupported);},[editor,disabled,unsupported]);
  function wrap(before:string,after=before,text="text"){
    const field=area.current;if(!field||disabled)return;
    const start=field.selectionStart,end=field.selectionEnd,next=value.slice(0,start)+before+(value.slice(start,end)||text)+after+value.slice(end);
    if(next.length>5000){setMessage("Keep the description under 5,000 characters.");return;}
    onChange(next);requestAnimationFrame(()=>{field.focus();field.setSelectionRange(start+before.length,start+before.length+(end-start||text.length));});
  }
  function line(prefix:string){const field=area.current;if(!field||disabled)return;const start=value.lastIndexOf("\n",field.selectionStart-1)+1;const next=value.startsWith(prefix,start)?value.slice(0,start)+value.slice(start+prefix.length):value.slice(0,start)+prefix+value.slice(start);if(next.length<=5000)onChange(next);requestAnimationFrame(()=>field.focus());}
  const blocked=disabled||(!source&&(!editor||unsupported));
  function applyLink(){
    const href=link.trim();
    if(href&&!/^(https?:\/\/|mailto:)/i.test(href)){setMessage("Use an https://, http:// or mailto: link.");return;}
    if(href)editor?.chain().focus().extendMarkRange("link").setLink({href}).run();else editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);setMessage("");
  }
  return <section className={`rich-description ${styles.editor}`}>
    <div className={styles.header}><span id={`${id}-label`}>{label}</span><button type="button" className={styles.modeToggle} aria-pressed={source} disabled={disabled} onClick={()=>{setSource(!source);setLinkOpen(false);}}><span aria-hidden="true">&lt;/&gt;</span> Markdown</button></div>
    <div className={styles.toolbar} role="toolbar" aria-label={`${label} formatting`}>
      <button type="button" aria-label="Bold" title="Bold" aria-pressed={!source&&active?.bold} disabled={blocked} onPointerDown={event=>event.preventDefault()} onClick={()=>source?wrap("**"):editor?.chain().focus().toggleBold().run()}><strong aria-hidden="true">B</strong></button>
      <button type="button" aria-label="Italic" title="Italic" aria-pressed={!source&&active?.italic} disabled={blocked} onPointerDown={event=>event.preventDefault()} onClick={()=>source?wrap("_"):editor?.chain().focus().toggleItalic().run()}><em aria-hidden="true">I</em></button>
      <button type="button" aria-label="Heading" title="Heading" aria-pressed={!source&&active?.heading} disabled={blocked} onPointerDown={event=>event.preventDefault()} onClick={()=>source?line("## "):editor?.chain().focus().toggleHeading({level:2}).run()}><span aria-hidden="true">H</span></button>
      <button type="button" aria-label="Bulleted list" title="Bulleted list" aria-pressed={!source&&active?.list} disabled={blocked} onPointerDown={event=>event.preventDefault()} onClick={()=>source?line("- "):editor?.chain().focus().toggleBulletList().run()}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12M3 6h.5M3 12h.5M3 18h.5"/></svg></button>
      <button type="button" aria-label="Insert link" title="Insert link" aria-pressed={!source&&active?.link} disabled={blocked} onPointerDown={event=>event.preventDefault()} onClick={()=>{if(source){wrap("[","](https://)","link text");return;}setLink(editor?.getAttributes("link").href??"");setLinkOpen(!linkOpen);}}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m10 13 4-2M9 15l-2 2a4 4 0 0 1-5-6l4-4a4 4 0 0 1 6 1m0 8a4 4 0 0 0 6 1l4-4a4 4 0 0 0-6-5l-2 2"/></svg></button>
    </div>
    {linkOpen&&<div className={styles.linkControls}><label>Link URL<input type="url" value={link} placeholder="https://example.com" onChange={event=>setLink(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();applyLink();}}}/></label><button type="button" onClick={applyLink}>Apply</button><button type="button" onClick={()=>setLinkOpen(false)}>Cancel</button></div>}
    <div hidden={!source}><textarea aria-labelledby={`${id}-label`} ref={area} placeholder={placeholder} value={value} disabled={disabled} maxLength={5000} required onInvalid={()=>{if(!source){setSource(true);requestAnimationFrame(()=>area.current?.focus());}}} onChange={event=>onChange(event.target.value)}/></div>
    <div hidden={source}>
      {unsupported?<><p>Use Markdown to edit this formatting without losing any content.</p><MarkdownDescription value={value}/></>:<EditorContent editor={editor} className={styles.visual} data-empty={active?.empty}/>}
    </div>
    {message&&<p role="status">{message}</p>}
  </section>;
}
