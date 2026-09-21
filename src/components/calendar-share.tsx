"use client";
import {useState} from "react";
export default function CalendarShare({nevent}:{nevent:string}) {
  const [message,setMessage]=useState("");
  async function copy() {
    try {await navigator.clipboard.writeText(`${window.location.origin}/${nevent}`);setMessage("Walk link copied to clipboard.");}
    catch {setMessage("Could not copy automatically. Open the event link and copy its address.");}
  }
  return <section><h2>Share this walk</h2><p><a href={`/${nevent}`}>Open this published event →</a></p><button type="button" onClick={copy}>Copy walk link</button><p role="status">{message}</p><details><summary>Nostr event identifier</summary><p style={{overflowWrap:"anywhere"}}>{nevent}</p></details><p>Rescheduling replaces the current calendar event. Older event links may become unavailable; the city page remains the place to find the current walk.</p></section>;
}
