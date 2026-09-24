export const WEATHER_FORECAST_DAYS = 16;
const DAY_SECONDS = 86_400;

export type WalkWeather = {
  icon: string;
  condition: string;
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationProbability: number;
  windSpeedKmh: number;
  forecastTime: number;
};

export type WalkWeatherState =
  | { kind: "forecast"; weather: WalkWeather }
  | { kind: "later"; availableAt: number }
  | { kind: "past" }
  | { kind: "unavailable" };

type HourlyForecast = {
  time?: unknown;
  temperature_2m?: unknown;
  apparent_temperature?: unknown;
  precipitation_probability?: unknown;
  weather_code?: unknown;
  wind_speed_10m?: unknown;
};

function numericArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function weatherCondition(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Mixed conditions";
}

export function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

export function forecastWindow(start: number, end: number, now = Math.floor(Date.now() / 1000)): WalkWeatherState | null {
  if (![start, end, now].every(Number.isSafeInteger) || end <= start) return { kind: "unavailable" };
  if (end < now) return { kind: "past" };
  if (start > now + WEATHER_FORECAST_DAYS * DAY_SECONDS) {
    return { kind: "later", availableAt: start - WEATHER_FORECAST_DAYS * DAY_SECONDS };
  }
  return null;
}

export function parseHourlyWeather(hourly: HourlyForecast, start: number): WalkWeather | null {
  const times = numericArray(hourly.time);
  const temperatures = numericArray(hourly.temperature_2m);
  const apparent = numericArray(hourly.apparent_temperature);
  const precipitation = numericArray(hourly.precipitation_probability);
  const codes = numericArray(hourly.weather_code);
  const wind = numericArray(hourly.wind_speed_10m);
  if (!times || !temperatures || !apparent || !precipitation || !codes || !wind) return null;
  const length = times.length;
  if (!length || [temperatures, apparent, precipitation, codes, wind].some(values => values.length !== length)) return null;
  if (!times.every(finiteNumber)) return null;
  let index = 0;
  for (let current = 1; current < length; current++) {
    if (Math.abs(times[current] - start) < Math.abs(times[index] - start)) index = current;
  }
  if (Math.abs(times[index] - start) > 5_400) return null;
  if (![temperatures[index], apparent[index], precipitation[index], codes[index], wind[index]].every(finiteNumber)) return null;
  const temperature=temperatures[index] as number,feels=apparent[index] as number,rain=precipitation[index] as number,code=codes[index] as number,windSpeed=wind[index] as number;
  return {
    icon: weatherIcon(code),
    condition: weatherCondition(code),
    temperatureC: temperature,
    apparentTemperatureC: feels,
    precipitationProbability: Math.max(0, Math.min(100, rain)),
    windSpeedKmh: Math.max(0, windSpeed),
    forecastTime: times[index],
  };
}

export async function getWalkWeather(input: {
  latitude: number;
  longitude: number;
  start: number;
  end: number;
  now?: number;
  fetcher?: typeof fetch;
}): Promise<WalkWeatherState> {
  const window = forecastWindow(input.start, input.end, input.now);
  if (window) return window;
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) return { kind: "unavailable" };
  const query = new URLSearchParams({
    latitude: String(input.latitude), longitude: String(input.longitude),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m",
    timeformat: "unixtime", timezone: "UTC", forecast_days: String(WEATHER_FORECAST_DAYS),
  });
  try {
    const response = await (input.fetcher ?? fetch)(`https://api.open-meteo.com/v1/forecast?${query}`, {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { kind: "unavailable" };
    const payload = await response.json() as { hourly?: HourlyForecast };
    const weather = payload.hourly ? parseHourlyWeather(payload.hourly, input.start) : null;
    return weather ? { kind: "forecast", weather } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
