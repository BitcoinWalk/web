import {describe, expect, it} from "vitest";
import {inspectCityTemplate, safeExportUrl} from "./figma-source";

const group = () => ({id:"2001:157",type:"GROUP",name:"Warszawa — 10 logo variants",children:
  ["black","white"].flatMap(background => ["bitcoinwalk-vertical","bitcoinwalk","bitcoinwalk-horizontal","satsman","satsman-vertical"].map((variant,index) => ({
    id:`${background}:${index}`,type:"GROUP",name:`-${variant}-on-${background}`,
    absoluteBoundingBox:{x:0,y:0,width:775,height:604},children:[{id:`text-${background}:${index}`,type:"TEXT",characters:"WARSZAWA",style:{fontFamily:"Ubuntu",fontPostScriptName:"Ubuntu-BoldItalic",fontSize:64},absoluteBoundingBox:{x:10,y:500,width:500,height:90}}],
  }))) });
describe("Figma template source capture", () => {
  it("inventories ten unique variants and exact font geometry", () => {
    const result=inspectCityTemplate(group(),"WARSZAWA");
    expect(result).toHaveLength(10);
    expect(result[0].text.style.fontFamily).toBe("Ubuntu");
    expect(result[0].text.bounds.width).toBe(500);
  });
  it("rejects incomplete or ambiguous variants", () => {
    const missing=group();missing.children.pop();expect(()=>inspectCityTemplate(missing,"WARSZAWA")).toThrow();
    const duplicate=group();duplicate.children[1].name=duplicate.children[0].name;expect(()=>inspectCityTemplate(duplicate,"WARSZAWA")).toThrow();
  });
  it("requires one city caption and preserves spelling", () => {
    const wrong=group();wrong.children[0].children[0].characters="BARCELONA";expect(()=>inspectCityTemplate(wrong,"WARSZAWA")).toThrow();
    const duplicate=group();duplicate.children[0].children.push(duplicate.children[0].children[0]);expect(()=>inspectCityTemplate(duplicate,"WARSZAWA")).toThrow();
  });
  it("rejects invalid geometry", () => {
    const bad=group();bad.children[0].absoluteBoundingBox.width=0;expect(()=>inspectCityTemplate(bad,"WARSZAWA")).toThrow();
  });
  it("only downloads from bounded Figma export origins", () => {
    expect(safeExportUrl("https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/abc")).toContain("https:");
    for(const url of ["http://localhost/a","https://127.0.0.1/a","https://evil.amazonaws.com/a","https://figma.com.evil.org/a","https://u:p@figma.com/a"]) expect(()=>safeExportUrl(url)).toThrow();
  });
});
