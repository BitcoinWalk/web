"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from "../lib/map-config";
import {webGL2Available} from "../lib/webgl";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export default function MapBasemap({ onUnavailable }: { onUnavailable?: () => void }) {
  const map = useMap();
  const unavailable = useRef(onUnavailable);

  useEffect(() => { unavailable.current = onUnavailable; }, [onUnavailable]);

  useEffect(() => {
    if(!webGL2Available()){unavailable.current?.();return;}
    let layer:ReturnType<typeof maplibreGL>;
    try{layer=maplibreGL({ style: MAP_STYLE_URL, attributionControl: false }).addTo(map);}catch{unavailable.current?.();return;}
    const vectorMap=layer.getMaplibreMap();
    let consecutiveErrors = 0;
    const handleLoad = () => { consecutiveErrors = 0; };
    const handleError = () => {
      consecutiveErrors += 1;
      if (consecutiveErrors === 3) unavailable.current?.();
    };

    vectorMap.on("load", handleLoad);
    vectorMap.on("error", handleError);
    map.attributionControl.addAttribution(MAP_ATTRIBUTION);
    return () => {
      vectorMap.off("load", handleLoad);
      vectorMap.off("error", handleError);
      map.attributionControl.removeAttribution(MAP_ATTRIBUTION);
      if(map.hasLayer(layer))map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
