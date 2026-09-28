"use client";

import { Marker, MapContainer, useMap, useMapEvents } from "react-leaflet";
import { Icon, type Marker as LeafletMarker } from "leaflet";
import markerImage from "leaflet/dist/images/marker-icon.png";
import markerRetinaImage from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useEffect, useRef, useState } from "react";
import MapBasemap from "./map-basemap";

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
  const [isSearching, setIsSearching] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [searchMessage,setSearchMessage]=useState("");
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

  async function searchCity() {
    if(cityLocked||isSearching||cityName.trim().length<2)return;
    active.current?.abort();
    const controller = new AbortController();
    active.current=controller;
      setIsSearching(true);
      setResults([]);setSearchMessage("");
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(cityName)}`, { signal: controller.signal });
        const data = (await response.json()) as { results: SearchResult[]; error?:string };
        if(controller.signal.aborted)return;
        if(!response.ok)throw new Error(data.error??"City search is unavailable. Please try again.");
        setResults(data.results);
        setSearchMessage(data.results.length?"Select a result below.":"No cities found. Try a more specific city name.");
      } catch (error) {
        if(!controller.signal.aborted){setResults([]);setSearchMessage(error instanceof Error?error.message:"Search failed.");}
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
  }

  function choose(result: SearchResult) {
    setViewTarget({ center: [result.latitude, result.longitude], zoom: 13 });
    onChange({ description: result.name, latitude: result.latitude, longitude: result.longitude });
    onCityNameChange(result.cityName);
    setResults([]);
  }

  return (
    <section>
      <label>City
        <input value={cityName} readOnly={cityLocked} maxLength={120} onChange={(event) => {active.current?.abort();setIsSearching(false);setResults([]);setSearchMessage("");onCityNameChange(event.target.value);}} onKeyDown={event=>{if(event.key==="Enter"&&!cityLocked){event.preventDefault();void searchCity();}}} placeholder="Cleveland, Ohio" required autoComplete="off" />
      </label>
      {!cityLocked&&<><button type="button" disabled={isSearching||cityName.trim().length<2} onClick={searchCity}>{isSearching?"Searching…":"Search city"}</button><p role="status">{searchMessage}</p></>}
      <div className="search-results">
        {!cityLocked && cityName.trim().length >= 2 && results.map((result) => <button key={`${result.latitude}:${result.longitude}`} type="button" onClick={() => choose(result)}>{result.name}</button>)}
      </div>
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
