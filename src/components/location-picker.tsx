"use client";

import { Marker, MapContainer, useMap, useMapEvents } from "react-leaflet";
import { Icon, type Marker as LeafletMarker } from "leaflet";
import markerImage from "leaflet/dist/images/marker-icon.png";
import markerRetinaImage from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import MapBasemap from "./map-basemap";
import MeetingPlaceSearch from "./meeting-place-search";
import ui from "../design-system/primitives.module.css";
import {
  CITY_SEARCH_DELAY,
  fetchCitySuggestions,
  fetchMeetingPointName,
  fetchMeetingPointSuggestions,
  narrowCitySuggestions,
  narrowMeetingPointSuggestions,
} from "../lib/city-autocomplete";
import type { PlaceSearchResult } from "../lib/geocode";
import styles from "./location-picker.module.css";

const assetUrl = (asset: string | { src: string }) =>
  typeof asset === "string" ? asset : asset.src;
const meetingPin = new Icon({
  iconUrl: assetUrl(markerImage),
  iconRetinaUrl: assetUrl(markerRetinaImage),
  shadowUrl: assetUrl(markerShadow),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

export type LocationValue = {
  description: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
};
type SearchResult = {
  name: string;
  cityName: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
};

function ManualCoordinates({
  cityName,
  value,
  onChange,
  open = false,
  asPanel = false,
}: {
  cityName: string;
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  open?: boolean;
  asPanel?: boolean;
}) {
  const [latitude, setLatitude] = useState(value ? String(value.latitude) : "");
  const [longitude, setLongitude] = useState(
    value ? String(value.longitude) : "",
  );
  const [message, setMessage] = useState("");

  function apply() {
    const nextLatitude = Number(latitude);
    const nextLongitude = Number(longitude);
    if (
      !Number.isFinite(nextLatitude) ||
      Math.abs(nextLatitude) > 90 ||
      !Number.isFinite(nextLongitude) ||
      Math.abs(nextLongitude) > 180
    ) {
      setMessage(
        "Enter a latitude from −90 to 90 and longitude from −180 to 180.",
      );
      return;
    }
    onChange({
      description: value?.description ?? cityName,
      latitude: nextLatitude,
      longitude: nextLongitude,
      ...(value?.countryCode ? { countryCode: value.countryCode } : {}),
    });
    setMessage("Coordinates applied.");
  }

  const fields = (
    <>
      <div className="coordinate-fallback__fields">
        <label>
          Latitude
          <input
            inputMode="decimal"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            placeholder="51.123456"
          />
        </label>
        <label>
          Longitude
          <input
            inputMode="decimal"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            placeholder="21.123456"
          />
        </label>
        <button type="button" onClick={apply}>
          Apply coordinates
        </button>
      </div>
      <p role="status">{message}</p>
    </>
  );
  return asPanel ? (
    <div className="coordinate-fallback">{fields}</div>
  ) : (
    <details className="coordinate-fallback" open={open}>
      <summary>Map not loading? Enter coordinates manually</summary>
      {fields}
    </details>
  );
}

function MapClickHandler({
  onPick,
}: {
  onPick: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click: (event) => onPick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function Recenter({
  target,
}: {
  target: { center: [number, number]; zoom: number };
}) {
  const map = useMap();
  useEffect(() => {
    map.setView(target.center, target.zoom);
  }, [target, map]);
  useEffect(() => {
    // A mounted map can be hidden between mobile form screens.
    const observer = new ResizeObserver(() => {
      if (map.getContainer().clientWidth)
        map.invalidateSize({ pan: true, animate: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function MeetingPointSearch({
  onChoose,
}: {
  onChoose: (result: PlaceSearchResult) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<PlaceSearchResult[]>([]),
    [resultsQuery, setResultsQuery] = useState(""),
    [open, setOpen] = useState(false),
    [activeIndex, setActiveIndex] = useState(-1),
    [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false),
    listId = useId(),
    active = useRef<AbortController | null>(null),
    debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = open
    ? narrowMeetingPointSuggestions(results, query, resultsQuery)
    : [];
  useEffect(
    () => () => {
      active.current?.abort();
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );
  const search = useCallback(async (value: string) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setSearching(true);
    setMessage("");
    setActiveIndex(-1);
    try {
      const matches = await fetchMeetingPointSuggestions(
        value,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResults(matches.slice(0, 5));
      setResultsQuery(value.trim());
      setOpen(true);
      setMessage(
        matches.length
          ? "Choose a result to move the meeting-point pin."
          : "No matching place found. Try a fuller address or enter coordinates below.",
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setResults([]);
        setResultsQuery("");
        setMessage(
          error instanceof Error
            ? error.message
            : "Meeting-point search failed.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, []);
  function update(value: string) {
    active.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    setQuery(value);
    setActiveIndex(-1);
    setOpen(true);
    setMessage("");
    setSearching(false);
    if (value.trim().length >= 2)
      debounce.current = setTimeout(
        () => void search(value.trim()),
        CITY_SEARCH_DELAY,
      );
    else {
      setResults([]);
      setResultsQuery("");
    }
  }
  function choose(result: PlaceSearchResult) {
    active.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    onChoose(result);
    setQuery("");
    setResults([]);
    setResultsQuery("");
    setOpen(false);
    setActiveIndex(-1);
    setMessage(
      "Location selected. Review the description and pin before saving.",
    );
  }
  return (
    <div className={styles.placeSearch}>
      <div className={styles.finder}>
          <input
            type="search"
            aria-label="Search for a meeting place"
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={visible.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              activeIndex >= 0 && visible[activeIndex]
                ? `${listId}-${activeIndex}`
                : undefined
            }
            placeholder="Address, landmark or coordinates"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(event) => update(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" && visible.length) {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, visible.length - 1),
                );
              } else if (event.key === "ArrowUp" && visible.length) {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Escape") {
                active.current?.abort();
                setOpen(false);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (visible.length) choose(visible[Math.max(0, activeIndex)]);
                else if (query.trim().length >= 2) {
                  if (debounce.current) clearTimeout(debounce.current);
                  void search(query.trim());
                }
              }
            }}
          />
        {visible.length > 0 && (
          <ul
            className={styles.suggestions}
            id={listId}
            role="listbox"
            aria-label="Meeting-point suggestions"
          >
            {visible.map((result, index) => {
              const [name, ...context] = result.name.split(", ");
              return (
                <li
                  key={`${result.latitude}:${result.longitude}:${result.name}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(result)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>
                    <strong>{name}</strong>
                    {context.length > 0 && <small>{context.join(", ")}</small>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className={styles.status} role="status">
        {searching ? "Searching meeting points…" : message}
      </p>
    </div>
  );
}

const mobileQuery = "(max-width: 40rem)";
function subscribeMobile(listener: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const getMobile = () => window.matchMedia(mobileQuery).matches;
const getServerMobile = () => false;

export default function LocationPicker({
  cityName,
  onCityNameChange,
  value,
  onChange,
  cityLocked = false,
  mobileMapTabs = false,
  stepped = false,
}: {
  cityName: string;
  onCityNameChange: (cityName: string) => void;
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  cityLocked?: boolean;
  mobileMapTabs?: boolean;
  stepped?: boolean;
}) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobile,
    getServerMobile,
  );
  const tabbed = mobileMapTabs && (isMobile || stepped);
  const [mapTab, setMapTab] = useState<"pin" | "coordinates">("pin");
  const tabsId = useId();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedCity, setSelectedCity] = useState(value ? cityName : "");
  const [searchOrigin, setSearchOrigin] = useState<[number, number] | null>(
    value ? [value.latitude, value.longitude] : null,
  );
  const [resultsQuery, setResultsQuery] = useState(""),
    [open, setOpen] = useState(false);
  const suggestions = narrowCitySuggestions(results, cityName, resultsQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [meetingPointMessage, setMeetingPointMessage] = useState("");
  const [query, setQuery] = useState<string | null>(null),
    [resultIndex, setResultIndex] = useState(-1);
  const listId = useId(),
    debounce = useRef<ReturnType<typeof setTimeout> | null>(null),
    composing = useRef(false);
  const active = useRef<AbortController | null>(null);
  const reverseActive = useRef<AbortController | null>(null);
  const cityInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      reverseActive.current?.abort();
    },
    [],
  );
  // Viewport changes only on mount or an explicit city search selection. Pin
  // changes and unrelated parent renders must not reset the user's zoom/pan.
  const [viewTarget, setViewTarget] = useState<{
    center: [number, number];
    zoom: number;
  }>(() => ({
    center: value ? [value.latitude, value.longitude] : [20, 0],
    zoom: value ? 13 : 2,
  }));
  const center: [number, number] = value
    ? [value.latitude, value.longitude]
    : viewTarget.center;

  function placePin(latitude: number, longitude: number) {
    reverseActive.current?.abort();
    const controller = new AbortController();
    reverseActive.current = controller;
    onChange({
      description: value?.description ?? cityName,
      latitude,
      longitude,
      ...(value?.countryCode ? { countryCode: value.countryCode } : {}),
    });
    setMeetingPointMessage("Finding the meeting-point name…");
    void fetchMeetingPointName(latitude, longitude, controller.signal)
      .then((name) => {
        if (controller.signal.aborted) return;
        onChange({
          description: name,
          latitude,
          longitude,
          ...(value?.countryCode ? { countryCode: value.countryCode } : {}),
        });
        setMeetingPointMessage(
          "Meeting-point name updated from the pin location. You can still edit it manually.",
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMeetingPointMessage("");
      });
  }

  function chooseMeetingPoint(result: PlaceSearchResult) {
    reverseActive.current?.abort();
    setViewTarget({ center: [result.latitude, result.longitude], zoom: 16 });
    onChange({
      description: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      ...(result.countryCode
        ? { countryCode: result.countryCode }
        : value?.countryCode
          ? { countryCode: value.countryCode }
          : {}),
    });
    setMeetingPointMessage(
      "Location selected. You can still make the description more precise.",
    );
  }

  const searchCity = useCallback(
    async (name: string) => {
      if (cityLocked || name.trim().length < 2) return;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setIsSearching(true);
      setResultIndex(-1);
      setSearchMessage("");
      try {
        const matches = await fetchCitySuggestions(name, controller.signal);
        if (controller.signal.aborted) return;
        setResults(matches.slice(0, 5));
        setResultsQuery(name);
        setSearchMessage(
          matches.length
            ? ""
            : "No cities found. Try another spelling or place the pin manually.",
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchMessage(
            error instanceof Error ? error.message : "Search failed.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    },
    [cityLocked],
  );
  useEffect(() => {
    if (query === null || query.trim().length < 2 || cityLocked) return;
    debounce.current = setTimeout(
      () => void searchCity(query),
      CITY_SEARCH_DELAY,
    );
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, cityLocked, searchCity]);
  function cancelSuggestions() {
    active.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    setQuery(null);
    setResults([]);
    setResultIndex(-1);
    setIsSearching(false);
  }
  function searchNow() {
    if (debounce.current) clearTimeout(debounce.current);
    void searchCity(cityName);
  }

  function choose(result: SearchResult) {
    cancelSuggestions();
    setOpen(false);
    setSearchMessage("");
    setViewTarget({ center: [result.latitude, result.longitude], zoom: 13 });
    onChange({
      description: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      ...(result.countryCode ? { countryCode: result.countryCode } : {}),
    });
    onCityNameChange(result.cityName);
    setSelectedCity(result.cityName);
    setSearchOrigin([result.latitude, result.longitude]);
    setResults([]);
    cityInput.current?.blur();
  }

  return (
    <section>
      {cityLocked ? (
        <MeetingPointSearch onChoose={chooseMeetingPoint} />
      ) : (
        <>
          <div className={styles.finder} data-location-city>
            <label>
              <span className="sr-only">City</span>
              <span className={styles.inputWrap}>
                <input
                  ref={cityInput}
                  aria-busy={isSearching}
                  value={cityName}
                  maxLength={120}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={open && !cityLocked && suggestions.length > 0}
                  aria-controls={listId}
                  aria-activedescendant={
                    open && resultIndex >= 0 && suggestions[resultIndex]
                      ? `${listId}-${resultIndex}`
                      : undefined
                  }
                  onFocus={() => setOpen(true)}
                  onBlur={() => setOpen(false)}
                  onCompositionStart={() => {
                    composing.current = true;
                    cancelSuggestions();
                  }}
                  onCompositionEnd={(event) => {
                    composing.current = false;
                    setIsSearching(
                      event.currentTarget.value.trim().length >= 2,
                    );
                    setQuery(event.currentTarget.value);
                  }}
                  onChange={(event) => {
                    setSelectedCity("");
                    active.current?.abort();
                    if (debounce.current) clearTimeout(debounce.current);
                    setIsSearching(
                      !composing.current &&
                        event.target.value.trim().length >= 2,
                    );
                    setOpen(true);
                    setResultIndex(-1);
                    setSearchMessage("");
                    onCityNameChange(event.target.value);
                    if (!composing.current) setQuery(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (cityLocked || event.nativeEvent.isComposing) return;
                    if (event.key === "ArrowDown" && suggestions.length) {
                      event.preventDefault();
                      setOpen(true);
                      setResultIndex((index) =>
                        Math.min(index + 1, suggestions.length - 1),
                      );
                    } else if (event.key === "ArrowUp" && suggestions.length) {
                      event.preventDefault();
                      setResultIndex((index) => Math.max(index - 1, 0));
                    } else if (event.key === "Escape") {
                      cancelSuggestions();
                      setOpen(false);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (open && suggestions.length)
                        choose(suggestions[Math.max(0, resultIndex)]);
                      else {
                        setOpen(true);
                        searchNow();
                      }
                    }
                  }}
                  placeholder="Type a city name…"
                  required
                  autoComplete="off"
                />
                {isSearching ? (
                  <span className={ui.searchSpinner} aria-hidden="true" />
                ) : selectedCity === cityName && selectedCity ? (
                  <span
                    className={styles.selectedTick}
                    title="City selected"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                ) : null}
              </span>
            </label>
            {open && !cityLocked && suggestions.length > 0 && (
              <ul
                className={styles.suggestions}
                id={listId}
                role="listbox"
                aria-label="City suggestions"
              >
                {suggestions.map((result, index) => (
                  <li
                    key={`${result.latitude}:${result.longitude}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={resultIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(result)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>
                      <strong>{result.cityName}</strong>
                      <small>
                        {result.name.startsWith(result.cityName + ", ")
                          ? result.name.slice(result.cityName.length + 2)
                          : result.name}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!cityLocked && (
            <p className={styles.status} role="status" data-location-city>
              {isSearching
                ? "Searching cities…"
                : searchMessage ||
                  (selectedCity === cityName && selectedCity && (
                    <span className="sr-only">{cityName} selected</span>
                  ))}
            </p>
          )}
          {!cityLocked&&<div data-location-city><GeocoderCredit className={styles.cityCredit}/></div>}
        </>
      )}
      <div data-location-map>
        {tabbed && (
          <div
            className={styles.mapTabs}
            role="tablist"
            aria-label="Meeting location input"
          >
            {(["pin", "coordinates"] as const).map((tab, index) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${tabsId}-${tab}`}
                aria-controls={`${tabsId}-${tab}-panel`}
                aria-selected={mapTab === tab}
                tabIndex={mapTab === tab ? 0 : -1}
                onClick={() => setMapTab(tab)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "pin"
                      : event.key === "End"
                        ? "coordinates"
                        : index === 0
                          ? "coordinates"
                          : "pin";
                  setMapTab(next);
                  document.getElementById(`${tabsId}-${next}`)?.focus();
                }}
              >
                {tab === "pin" ? "Place Pin" : "Or Coordinates"}
              </button>
            ))}
          </div>
        )}
        {!tabbed && (
          <p>
            {mapUnavailable
              ? "Interactive map unavailable. Search for the city to set its coordinates, then adjust them manually if needed."
              : cityLocked
                ? "Click the map or drag the pin to move the meeting point. The city and its URL stay unchanged."
                : isSearching
                  ? "Finding cities…"
                  : "Select a city, then click the map or drag the pin to place the meeting point precisely."}
          </p>
        )}
        <div
          id={`${tabsId}-pin-panel`}
          role={tabbed ? "tabpanel" : undefined}
          aria-labelledby={tabbed ? `${tabsId}-pin` : undefined}
          hidden={tabbed && mapTab !== "pin"}
        >
          {mobileMapTabs &&
            selectedCity === cityName &&
            searchOrigin && (
              <MeetingPlaceSearch
                key={cityName}
                city={cityName}
                latitude={searchOrigin[0]}
                longitude={searchOrigin[1]}
                onSelect={(place) => {
                  setViewTarget({
                    center: [place.latitude, place.longitude],
                    zoom: 17,
                  });
                  onChange({
                    description: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    ...((value?.countryCode || place.countryCode)
                      ? {countryCode:value?.countryCode || place.countryCode}
                      : {}),
                  });
                }}
              />
            )}
          {!mapUnavailable && (
            <div className="map">
              <MapContainer
                center={viewTarget.center}
                zoom={viewTarget.zoom}
                minZoom={1}
                className="map"
                scrollWheelZoom
              >
                <MapBasemap onUnavailable={() => setMapUnavailable(true)} />
                <Recenter target={viewTarget} />
                {value && (
                  <Marker
                    position={center}
                    icon={meetingPin}
                    draggable
                    title="Meeting point"
                    alt="Meeting-point pin"
                    eventHandlers={{
                      dragend: (event) => {
                        const position = (
                          event.target as LeafletMarker
                        ).getLatLng();
                        placePin(position.lat, position.lng);
                      },
                    }}
                  />
                )}
                <MapClickHandler onPick={placePin} />
              </MapContainer>
            </div>
          )}
          {meetingPointMessage && (
            <p className={styles.status} role="status">
              {meetingPointMessage}
            </p>
          )}
          {mapUnavailable && (
            <p role="status">
              Your selected coordinates are preserved. WebGL2 is optional;
              continue with city search and the coordinate fields below.
            </p>
          )}
        </div>
        <div
          id={`${tabsId}-coordinates-panel`}
          role={tabbed ? "tabpanel" : undefined}
          aria-labelledby={tabbed ? `${tabsId}-coordinates` : undefined}
          hidden={tabbed && mapTab !== "coordinates"}
        >
          <ManualCoordinates
            key={value ? `${value.latitude}:${value.longitude}` : "empty"}
            cityName={cityName}
            value={value}
            onChange={onChange}
            open={mapUnavailable}
            asPanel={tabbed}
          />
        </div>
        {value && !tabbed && (
          <p>
            Pin: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
          </p>
        )}
        <GeocoderCredit/>
      </div>
    </section>
  );
}
function GeocoderCredit({className}:{className?:string}) {
  return <small className={`${styles.credit}${className?` ${className}`:""}`} data-geocoder-credit>Search by <a href="https://locationiq.com/" target="_blank" rel="noreferrer">LocationIQ</a> · Fallback by <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>;
}
