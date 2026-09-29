import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import WalkDescriptions from "./walk-descriptions";

describe("public walk descriptions",()=>{
  it("shows approved city text and a different event description with separate labels",()=>{
    const html=renderToStaticMarkup(createElement(WalkDescriptions,{cityName:"Norilsk",cityDescription:"Lorem ipsum",eventDescription:"Meet at the station for this walk."}));
    expect(html).toContain("About BitcoinWalk Norilsk");
    expect(html).toContain("Lorem ipsum");
    expect(html).toContain("About this walk");
    expect(html).toContain("Meet at the station for this walk.");
  });
  it("displays identical descriptions only once, ignoring surrounding whitespace",()=>{
    const html=renderToStaticMarkup(createElement(WalkDescriptions,{cityName:"Norilsk",cityDescription:"Join our city walk",eventDescription:" Join our city walk\n"}));
    expect(html.match(/Join our city walk/g)).toHaveLength(1);
    expect(html).not.toContain("About this walk");
  });
});
