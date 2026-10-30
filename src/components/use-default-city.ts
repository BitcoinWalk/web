"use client";
import {useEffect,useState} from "react";
import {cachedDefaultCity,readDefaultCity} from "../nostr/default-city";
export function useDefaultCity(pubkey:string){
 const [value,setValue]=useState({pubkey:"",cityId:""});
 useEffect(()=>{if(!pubkey)return;let active=true;
  const update=()=>{if(active)setValue({pubkey,cityId:cachedDefaultCity(pubkey)});};
  queueMicrotask(update);
  window.addEventListener("bitcoinwalk-default-city-changed",update);window.addEventListener("storage",update);
  void readDefaultCity(pubkey).catch(()=>{/* Keep this account's cached choice while offline. */});
  return()=>{active=false;window.removeEventListener("bitcoinwalk-default-city-changed",update);window.removeEventListener("storage",update);};
 },[pubkey]);
 return value.pubkey===pubkey?value.cityId:"";
}
