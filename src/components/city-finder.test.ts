import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityFinder,{filterCityFinderItems,type CityFinderItem} from "./city-finder";

const cities:CityFinderItem[]=[
 {id:"1",name:"Łódź",meta:"approved",keywords:["lodz-poland"]},
 {id:"2",name:"New York",meta:"disapproved",keywords:["nyc"]},
 {id:"3",name:"York",meta:"archived"},
];
describe("reusable city finder",()=>{
 it("filters case-insensitively across names, status and keywords",()=>{
  expect(filterCityFinderItems(cities,"lodz").map(city=>city.id)).toEqual(["1"]);
  expect(filterCityFinderItems(cities,"NEW disapproved").map(city=>city.id)).toEqual(["2"]);
  expect(filterCityFinderItems(cities,"approved").map(city=>city.id)).toEqual(["1"]);
  expect(filterCityFinderItems(cities,"nyc").map(city=>city.id)).toEqual(["2"]);
  expect(filterCityFinderItems(cities,"")).toHaveLength(3);
 });
 it("renders an accessible searchable combobox",()=>{
  const html=renderToStaticMarkup(createElement(CityFinder,{items:cities,value:"",onChange:()=>{}}));
  expect(html).toContain('role="combobox"');expect(html).toContain('aria-expanded="false"');expect(html).toContain("Search cities…");
 });
});
