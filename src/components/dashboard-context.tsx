"use client";
import {createContext,useContext,useEffect,useRef} from "react";
import type {DashboardRole} from "../domain/dashboard";
import type {DashboardCity} from "../nostr/dashboard-data";
import type {ApprovalRecord,AuthorizationRecord,CityRevision} from "../nostr/city-records";
export type DashboardSession={pubkey:string;role:DashboardRole;cityCount:number;cities:DashboardCity[];selectedCity:string;grants:AuthorizationRecord[];directory:{revisions:CityRevision[];approvals:ApprovalRecord[]}|null};
export const emptyDashboardSession:DashboardSession={pubkey:"",role:"disconnected",cityCount:0,cities:[],selectedCity:"",grants:[],directory:null};
export const DashboardContext=createContext<DashboardSession>(emptyDashboardSession);
export const useDashboard=()=>useContext(DashboardContext);
/** One read on mount/identity change. City changes remount the section in the shell. */
export function useDashboardAutoLoad(load:()=>Promise<void>){
 const {pubkey}=useDashboard(),latest=useRef(load);
 useEffect(()=>{latest.current=load;},[load]);
 useEffect(()=>{if(!pubkey)return;let active=true;queueMicrotask(()=>{if(active)void latest.current();});return()=>{active=false;};},[pubkey]);
}
