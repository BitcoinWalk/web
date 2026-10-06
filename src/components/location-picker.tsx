"use client";

import { Marker, MapContainer, useMap, useMapEvents } from "react-leaflet";
import { Icon, type Marker as LeafletMarker } from "leaflet";
import markerImage from "leaflet/dist/images/marker-icon.png";
import markerRetinaImage from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import MapBasemap from "./map-basemap";
import {CITY_SEARCH_DELAY,fetchCitySuggestions,narrowCitySuggestions} from "../lib/city-autocomplete";
import styles from "./location-picker.module.css";

const assetUrl = (asset: string | { src: string }) => typeof asset === "string" ? asset : asset.src;
const meetingPin = new Icon({
  iconUrl: assetUrl(markerImage), iconRetinaUrl: assetUrl(markerRetinaImage), shadowUrl: assetUrl(markerShadow),
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41], shadowAnchor: [12, 41],
});

export type LocationValue = { description: string; latitude: number; longitude: number };
type SearchResult = { name: string; cityName: string; latitude: number; longitude: number };

function ManualCoordinates({ cityName, value, onChange }: { cityName: string; value: LocationValue | null; onChange: (value: LocationValue) => void }) {
  const [latitude, setLatitude] = useState(value ? String(value.latitude) : "");
  const [longitude, setLongitude] = useState(value ? String(value.longitude) : "");
  const [message, setMessage] = useState("");

  function apply() {
    const nextLatitude = Number(latitude);
    const nextLongitude = Number(longitude);
    if (!Number.isFinite(nextLatitude) || Math.abs(nextLatitude) > 90 || !Number.isFinite(nextLongitude) || Math.abs(nextLongitude) > 180) {
      setMessage("Enter a latitude from −90 to 90 and longitude from −180 to 180.");
      return;
    }
    onChange({ description: value?.description ?? cityName, latitude: nextLatitude, longitude: nextLongitude });
    setMessage("Coordinates applied.");
  }

  return <details className="coordinate-fallback">
    <summary>Map not loading? Enter coordinates manually</summary>
    <div className="coordinate-fallback__fields">
      <label>Latitude<input inputMode="decimal" value={latitude} onChange={event => setLatitude(event.target.value)} placeholder="51.123456" /></label>
      <label>Longitude<input inputMode="decimal" value={longitude} onChange={event => setLongitude(event.target.value)} placeholder="21.123456" /></label>
      <button type="button" onClick={apply}>Apply coordinates</button>
    </div>
    <p role="status">{message}</p>
  </details>;
}

function MapClickHandler({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

function Recenter({ target }: { target: { center: [number, number]; zoom: number } }) {
  const map = useMap();
  useEffect(() => { map.setView(target.center, target.zoom); }, [target, map]);
  return null;
}

export default function LocationPicker({
  cityName,
  onCityNameChange,
  value,
  onChange,
  cityLocked = false,
}: {
  cityName: string;
  onCityNameChange: (cityName: string) => void;
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  cityLocked?: boolean;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsQuery,setResultsQuery]=useState(""),[open,setOpen]=useState(false);
  const suggestions=narrowCitySuggestions(results,cityName,resultsQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [searchMessage,setSearchMessage]=useState("");
  const [query,setQuery]=useState<string|null>(null),[resultIndex,setResultIndex]=useState(-1);
  const listId=useId(),debounce=useRef<ReturnType<typeof setTimeout>|null>(null),composing=useRef(false);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  // Viewport changes only on mount or an explicit city search selection. Pin
  // changes and unrelated parent renders must not reset the user's zoom/pan.
  const [viewTarget, setViewTarget] = useState<{ center: [number, number]; zoom: number }>(() => ({
    center: value ? [value.latitude, value.longitude] : [20, 0], zoom: value ? 13 : 2,
  }));
  const center: [number, number] = value ? [value.latitude, value.longitude] : viewTarget.center;

  function placePin(latitude: number, longitude: number) {
    onChange({ description: value?.description ?? cityName, latitude, longitude });
  }

  const searchCity=useCallback(async(name:string)=>{
    if(cityLocked||name.trim().length<2)return;
    active.current?.abort();
    const controller = new AbortController();
    active.current=controller;
      setIsSearching(true);
      setResultIndex(-1);setSearchMessage("");
      try {
        const matches=await fetchCitySuggestions(name,controller.signal);
        if(controller.signal.aborted)return;
        setResults(matches.slice(0,5));setResultsQuery(name);
        setSearchMessage(matches.length?"":"No cities found. Try another spelling or place the pin manually.");
      } catch (error) {
        if(!controller.signal.aborted){setResults([]);setSearchMessage(error instanceof Error?error.message:"Search failed.");}
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
  },[cityLocked]);
  useEffect(()=>{if(query===null||query.trim().length<2||cityLocked)return;debounce.current=setTimeout(()=>void searchCity(query),CITY_SEARCH_DELAY);return()=>{if(debounce.current)clearTimeout(debounce.current);};},[query,cityLocked,searchCity]);
  function cancelSuggestions(){active.current?.abort();if(debounce.current)clearTimeout(debounce.current);setQuery(null);setResults([]);setResultIndex(-1);setIsSearching(false);}
  function searchNow(){if(debounce.current)clearTimeout(debounce.current);void searchCity(cityName);}

  function choose(result: SearchResult) {
    cancelSuggestions();setOpen(false);setSearchMessage("");
    setViewTarget({ center: [result.latitude, result.longitude], zoom: 13 });
    onChange({ description: result.name, latitude: result.latitude, longitude: result.longitude });
    onCityNameChange(result.cityName);
    setResults([]);
  }

  return (
    <section>
      <div className={styles.finder}>
      <label>City
        <input value={cityName} readOnly={cityLocked} maxLength={120} role="combobox" aria-autocomplete="list" aria-expanded={open&&!cityLocked&&suggestions.length>0} aria-controls={listId} aria-activedescendant={open&&resultIndex>=0&&suggestions[resultIndex]?`${listId}-${resultIndex}`:undefined} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onCompositionStart={()=>{composing.current=true;cancelSuggestions();}} onCompositionEnd={event=>{composing.current=false;setQuery(event.currentTarget.value);}} onChange={(event) => {active.current?.abort();if(debounce.current)clearTimeout(debounce.current);setIsSearching(false);setOpen(true);setResultIndex(-1);setSearchMessage("");onCityNameChange(event.target.value);if(!composing.current)setQuery(event.target.value);}} onKeyDown={event=>{if(cityLocked||event.nativeEvent.isComposing)return;if(event.key==="ArrowDown"&&suggestions.length){event.preventDefault();setOpen(true);setResultIndex(index=>Math.min(index+1,suggestions.length-1));}else if(event.key==="ArrowUp"&&suggestions.length){event.preventDefault();setResultIndex(index=>Math.max(index-1,0));}else if(event.key==="Escape"){cancelSuggestions();setOpen(false);}else if(event.key==="Enter"){event.preventDefault();if(open&&suggestions.length)choose(suggestions[Math.max(0,resultIndex)]);else {setOpen(true);searchNow();}}}} placeholder="Type a city name…" required autoComplete="off" />
      </label>
      {open&&!cityLocked&&suggestions.length>0&&<ul className={styles.suggestions} id={listId} role="listbox" aria-label="City suggestions">
        {suggestions.map((result,index)=><li key={`${result.latitude}:${result.longitude}`} id={`${listId}-${index}`} role="option" aria-selected={resultIndex===index} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(result)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span><strong>{result.cityName}</strong><small>{result.name.startsWith(result.cityName+", ")?result.name.slice(result.cityName.length+2):result.name}</small></span></li>)}
      </ul>}
      </div>
      {!cityLocked&&<p className={styles.status} role="status">{isSearching?"Searching cities…":searchMessage}</p>}
      <p>{cityLocked ? "Click the map or drag the pin to move the meeting point. The city and its URL stay unchanged." : isSearching ? "Finding cities…" : "Select a city, then click the map or drag the pin to place the meeting point precisely."}</p>
      <div className="map">
        <MapContainer center={viewTarget.center} zoom={viewTarget.zoom} minZoom={1} className="map" scrollWheelZoom>
          <MapBasemap onUnavailable={() => setMapUnavailable(true)} />
          <Recenter target={viewTarget} />
          {value && <Marker position={center} icon={meetingPin} draggable title="Meeting point" alt="Meeting-point pin" eventHandlers={{ dragend: event => {
            const position = (event.target as LeafletMarker).getLatLng();
            placePin(position.lat, position.lng);
          } }} />}
          <MapClickHandler onPick={placePin} />
        </MapContainer>
      </div>
      {mapUnavailable && <p role="alert">The map background could not load. Your selected coordinates are still available, and you can enter them manually below.</p>}
      <ManualCoordinates key={value ? `${value.latitude}:${value.longitude}` : "empty"} cityName={cityName} value={value} onChange={onChange} />
      {value && <p>Pin: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p>}
    </section>
  );
}
