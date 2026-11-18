"use client";

import {useEffect,useState} from "react";
import type {GuideConversationMessage} from "../../../nostr/guide-processing";

export default function GuideProcessingStatus({message}:{message:GuideConversationMessage}){
 const [expiredUntil,setExpiredUntil]=useState<number>();
 useEffect(()=>{
  if(!message.processingUntil)return;
  const timer=setTimeout(()=>setExpiredUntil(message.processingUntil),Math.max(0,message.processingUntil*1000-Date.now()));
  return()=>clearTimeout(timer);
 },[message.processingUntil]);
 if(message.processingFailed)return <small role="status">Guide could not complete this question. Please try again later.</small>;
 if(!message.processingUntil)return null;
 return <small role="status">{expiredUntil===message.processingUntil?"Guide’s processing status expired. Refresh messages to check for a reply.":<span aria-label="Guide is working on this question" title="Guide is working on this question">👀</span>}</small>;
}
