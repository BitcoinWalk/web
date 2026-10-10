"use client";
import {useEffect} from "react";
import {MapContainer,CircleMarker,Popup,useMap} from "react-leaflet";
import type {DirectoryCity} from "../domain/directory";
import MapBasemap from "./map-basemap";
function Bounds({cities}:{cities:DirectoryCity[]}) {
  const map=useMap();
  useEffect(()=>{
    if(cities.length)map.fitBounds(cities.map(({city})=>[city.meetingPoint.latitude,city.meetingPoint.longitude] as [number,number]),{padding:[30,30],maxZoom:12});
  },[cities,map]);return null;
}
export default function DirectoryMap({cities}:{cities:DirectoryCity[]}) {
  return <><p><span style={{color:"#ae4c00"}} aria-hidden="true">●</span> Active or upcoming walk · <span style={{color:"#6b7280"}} aria-hidden="true">●</span> No upcoming walk scheduled</p><MapContainer center={[30,0]} zoom={2} minZoom={1} style={{height:"24rem",width:"100%"}} scrollWheelZoom={false}>
    <MapBasemap />
    <Bounds cities={cities}/>
    {cities.map(({city,href,hasUpcomingWalk})=><CircleMarker key={city.cityId} center={[city.meetingPoint.latitude,city.meetingPoint.longitude]} radius={9} pathOptions={{color:hasUpcomingWalk?"#ae4c00":"#6b7280",fillColor:hasUpcomingWalk?"#f7931a":"#9ca3af",fillOpacity:.85}}><Popup><strong>{city.cityName}</strong><p>{hasUpcomingWalk?"Active or upcoming walk":"No upcoming walk scheduled"}</p><p>{city.meetingPoint.description}</p><a href={href}>{hasUpcomingWalk?"View walk →":"View city →"}</a></Popup></CircleMarker>)}
  </MapContainer></>;
}
