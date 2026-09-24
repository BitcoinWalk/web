import type {WalkWeatherState} from "./walk-weather";

export type WeatherHeroVariant="clear"|"overcast"|"rain";

const PILOT_ASSETS:Record<string,string>={
  memphis:"memphis",
  warsaw:"warszawa",
  warszawa:"warszawa",
  funchal:"funchal",
};

export function weatherHeroVariant(condition:string):WeatherHeroVariant {
  if (["Drizzle","Rain","Thunderstorms","Snow"].includes(condition)) return "rain";
  if (["Clear sky","Mostly clear"].includes(condition)) return "clear";
  return "overcast";
}

export function pilotWeatherHero(slug:string,state:WalkWeatherState):string|null {
  const asset=PILOT_ASSETS[slug.toLowerCase()];
  if (!asset||state.kind!=="forecast") return null;
  return `/images/weather-heroes/${asset}/${weatherHeroVariant(state.weather.condition)}.webp`;
}
