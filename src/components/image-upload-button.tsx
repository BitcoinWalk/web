"use client";

import {useRef} from "react";
import styles from "./image-upload-button.module.css";

type ImageUploadButtonProps={
  label:string;
  busyLabel?:string;
  busy?:boolean;
  disabled?:boolean;
  onSelect:(file:File)=>void;
};

export function ImageUploadButton({label,busyLabel="Uploading…",busy=false,disabled=false,onSelect}:ImageUploadButtonProps){
  const input=useRef<HTMLInputElement>(null);
  const unavailable=busy||disabled;
  return <span className={styles.wrapper}>
    <input
      ref={input}
      className={styles.input}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={unavailable}
      tabIndex={-1}
      onChange={event=>{
        const file=event.target.files?.[0];
        event.target.value="";
        if(file)onSelect(file);
      }}
    />
    <button className={styles.button} type="button" disabled={unavailable} onClick={()=>input.current?.click()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>
      </svg>
      {busy?busyLabel:label}
    </button>
  </span>;
}
