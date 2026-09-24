"use client";
import {useEffect} from "react";
import {legacyDashboardHref} from "../domain/dashboard";
export default function DashboardRedirect({from}:{from:string}){const href=legacyDashboardHref(from);useEffect(()=>{window.location.replace(legacyDashboardHref(from,window.location.search,window.location.hash));},[from]);return <main><h1>Dashboard moved</h1><p><a href={href}>Continue to the BitcoinWalk dashboard</a></p></main>;}
