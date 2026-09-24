import {describe,expect,it} from "vitest";
import {pilotWeatherHero,weatherHeroVariant} from "./weather-hero";
import type {WalkWeatherState} from "./walk-weather";

const forecast=(condition:string):WalkWeatherState=>({kind:"forecast",weather:{condition,icon:"",temperatureC:10,apparentTemperatureC:9,precipitationProbability:20,windSpeedKmh:5,forecastTime:1}});

describe("weather hero",()=>{
  it("groups weather into the three approved visual variants",()=>{
    expect(weatherHeroVariant("Clear sky")).toBe("clear");
    expect(weatherHeroVariant("Rain")).toBe("rain");
    expect(weatherHeroVariant("Snow")).toBe("rain");
    expect(weatherHeroVariant("Foggy")).toBe("overcast");
  });

  it("maps only pilot cities with a current forecast",()=>{
    expect(pilotWeatherHero("memphis",forecast("Clear sky"))).toBe("/images/weather-heroes/memphis/clear.webp");
    expect(pilotWeatherHero("warsaw",forecast("Overcast"))).toBe("/images/weather-heroes/warszawa/overcast.webp");
    expect(pilotWeatherHero("warszawa",forecast("Rain"))).toBe("/images/weather-heroes/warszawa/rain.webp");
    expect(pilotWeatherHero("funchal",forecast("Drizzle"))).toBe("/images/weather-heroes/funchal/rain.webp");
    expect(pilotWeatherHero("austin",forecast("Clear sky"))).toBeNull();
    expect(pilotWeatherHero("memphis",{kind:"later",availableAt:1})).toBeNull();
  });
});
