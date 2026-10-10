import {describe,expect,it} from "vitest";
import {webGL2Available} from "./webgl";

describe("WebGL2 capability detection",()=>{
  it("accepts an available WebGL2 context",()=>{
    expect(webGL2Available(()=>({getContext:name=>name==="webgl2"?{}:null}))).toBe(true);
  });
  it("falls back when privacy settings disable or block WebGL2",()=>{
    expect(webGL2Available(()=>({getContext:()=>null}))).toBe(false);
    expect(webGL2Available(()=>({getContext:()=>{throw new Error("blocked");}}))).toBe(false);
  });
  it("does not claim browser capability during server rendering",()=>{
    expect(webGL2Available()).toBe(false);
  });
});
