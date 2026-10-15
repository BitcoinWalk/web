import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import WalkDescriptions from "./walk-descriptions";

describe("public walk descriptions",()=>{
  it("shows only the latest walk-specific description when it differs from the city profile",()=>{
    const html=renderToStaticMarkup(createElement(WalkDescriptions,{cityName:"Norilsk",cityDescription:"Lorem ipsum",eventDescription:"Meet at the station for this walk."}));
    expect(html).toContain("About this walk");
    expect(html).toContain("Meet at the station for this walk.");
    expect(html).not.toContain("About BitcoinWalk Norilsk");
    expect(html).not.toContain("Lorem ipsum");
  });
  it("displays identical descriptions only once, ignoring surrounding whitespace",()=>{
    const html=renderToStaticMarkup(createElement(WalkDescriptions,{cityName:"Norilsk",cityDescription:"Join our city walk",eventDescription:" Join our city walk\n"}));
    expect(html.match(/Join our city walk/g)).toHaveLength(1);
    expect(html).not.toContain("About this walk");
  });
});
