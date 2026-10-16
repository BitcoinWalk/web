import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import SearchablePicker,{filterSearchablePickerItems,nextPickerIndex} from "./searchable-picker";

const items=[{id:"1",name:"Łódź",meta:"Paid",keywords:["lodz-poland"]},{id:"2",name:"New York",meta:"Basic",keywords:["nyc"]}];
describe("searchable picker",()=>{
 it("filters normalized aliases and metadata",()=>{expect(filterSearchablePickerItems(items,"lodz").map(item=>item.id)).toEqual(["1"]);expect(filterSearchablePickerItems(items,"new basic").map(item=>item.id)).toEqual(["2"]);});
 it("uses predictable keyboard navigation",()=>{expect(nextPickerIndex(-1,"ArrowDown",3)).toBe(0);expect(nextPickerIndex(-1,"ArrowUp",3)).toBe(2);expect(nextPickerIndex(1,"Home",3)).toBe(0);expect(nextPickerIndex(1,"End",3)).toBe(2);expect(nextPickerIndex(0,"ArrowUp",3)).toBe(0);});
 it("keeps domain labels configurable",()=>{const html=renderToStaticMarkup(createElement(SearchablePicker,{items,value:"",label:"Sponsor",placeholder:"Search sponsors…",listLabel:"Sponsors",singular:"sponsor",plural:"sponsors",clearLabel:"Clear selected sponsor",onChange:()=>{}}));expect(html).toContain("Search sponsors…");expect(html).not.toContain("Cities");expect(html).not.toContain("selected city");});
});
