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
  return <MapContainer center={[30,0]} zoom={2} minZoom={1} style={{height:"24rem",width:"100%"}} scrollWheelZoom={false}>
    <MapBasemap />
    <Bounds cities={cities}/>
    {cities.map(({city,href})=><CircleMarker key={city.cityId} center={[city.meetingPoint.latitude,city.meetingPoint.longitude]} radius={9} pathOptions={{color:"#ae4c00",fillColor:"#f7931a",fillOpacity:.85}}><Popup><strong>{city.cityName}</strong><p>{city.meetingPoint.description}</p><a href={href}>View walk →</a></Popup></CircleMarker>)}
  </MapContainer>;
}
