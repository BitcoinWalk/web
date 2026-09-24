import type {WalkWeatherState} from "../domain/walk-weather";

export default function WalkWeather({result,timeZone,chatUrl}:{result:WalkWeatherState;timeZone:string|null;chatUrl?:string|null}) {
  const community=chatUrl?<a className="weather-chat" href={chatUrl} target="_blank" rel="noopener noreferrer">💬 Join community ↗</a>:null;
  if(result.kind==="past")return null;
  if(result.kind==="later")return <p className="walk-weather" aria-label="Walk weather"><span aria-hidden="true">🌦️</span> Forecast available from {new Intl.DateTimeFormat(undefined,{dateStyle:"medium",...(timeZone?{timeZone}:{})}).format(new Date(result.availableAt*1000))}. {community}</p>;
  if(result.kind==="unavailable")return <p className="walk-weather" aria-label="Walk weather"><span aria-hidden="true">🌦️</span> Forecast temporarily unavailable. {community}</p>;
  const weather=result.weather;
  return <p className="walk-weather" aria-label={`Walk weather: ${weather.condition}, ${Math.round(weather.temperatureC)} degrees Celsius, ${Math.round(weather.precipitationProbability)} percent chance of rain, wind ${Math.round(weather.windSpeedKmh)} kilometres per hour`}><span aria-hidden="true">{weather.icon}</span> <strong>{Math.round(weather.temperatureC)}°C</strong> <span className="weather-detail" title={weather.condition}>{weather.condition}</span> <span className="weather-detail" title="Chance of rain" aria-hidden="true">💧 {Math.round(weather.precipitationProbability)}%</span> <span className="weather-detail" title="Wind speed" aria-hidden="true">💨 {Math.round(weather.windSpeedKmh)} km/h</span> {community}</p>;
}
