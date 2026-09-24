import {describe,expect,it,vi} from "vitest";
import {forecastWindow,getWalkWeather,parseHourlyWeather,weatherCondition,weatherIcon,WEATHER_FORECAST_DAYS} from "./walk-weather";

describe("walk weather",()=>{
  it("waits until a distant walk enters the forecast horizon",()=>{
    const now=1_800_000_000,start=now+(WEATHER_FORECAST_DAYS+4)*86_400;
    expect(forecastWindow(start,start+3600,now)).toEqual({kind:"later",availableAt:start-WEATHER_FORECAST_DAYS*86_400});
  });
  it("does not show a forecast after the walk",()=>expect(forecastWindow(100,200,201)).toEqual({kind:"past"}));
  it("selects the forecast hour nearest the signed walk time",()=>{
    const weather=parseHourlyWeather({time:[1000,4600,8200],temperature_2m:[10,12,null],apparent_temperature:[8,11,null],precipitation_probability:[20,40,null],weather_code:[2,61,null],wind_speed_10m:[5,7,null]},4400);
    expect(weather).toMatchObject({icon:"🌧️",condition:"Rain",temperatureC:12,apparentTemperatureC:11,precipitationProbability:40,windSpeedKmh:7,forecastTime:4600});
  });
  it("rejects a response when the selected hour itself is incomplete",()=>{
    expect(parseHourlyWeather({time:[1000],temperature_2m:[null],apparent_temperature:[8],precipitation_probability:[20],weather_code:[2],wind_speed_10m:[5]},1000)).toBeNull();
  });
  it("maps standard weather codes to readable conditions",()=>{
    expect(weatherCondition(0)).toBe("Clear sky");
    expect(weatherCondition(95)).toBe("Thunderstorms");
    expect(weatherIcon(0)).toBe("☀️");
    expect(weatherIcon(95)).toBe("⛈️");
  });
  it("fails softly when the provider is unavailable",async()=>{
    const fetcher=vi.fn().mockRejectedValue(new Error("offline"));
    await expect(getWalkWeather({latitude:35,longitude:-90,start:2000,end:3000,now:1000,fetcher})).resolves.toEqual({kind:"unavailable"});
  });
});
