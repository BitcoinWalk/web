"use client";
import {useState} from "react";
import {allTrailsRoute} from "../domain/walk-route";

export default function WalkRoute({url}:{url:string}){const[loaded,setLoaded]=useState(false);let route;try{route=allTrailsRoute(url);}catch{return null;}if(!route)return null;return <section className="walk-route"><h2>Walking route</h2>{loaded?<iframe title="BitcoinWalk route on AllTrails" src={route.embedUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/>:<div className="walk-route__consent"><p>The interactive route is provided by AllTrails. Loading it connects your browser to AllTrails.</p><button type="button" onClick={()=>setLoaded(true)}>Load interactive route</button></div>}<p><a href={route.url} target="_blank" rel="noopener noreferrer">Open route in AllTrails ↗</a></p></section>;}
