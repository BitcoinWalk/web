import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import WalkRoute from "./walk-route";

describe("walk route presentation",()=>{
 it("shows custom routes as links without an unsupported map button",()=>{
  const html=renderToStaticMarkup(createElement(WalkRoute,{url:"https://www.alltrails.com/explore/custom-routes/custom-route-camacha-levada-dos-tornos-48092f7?u=m&sh=vmjvek"}));
  expect(html).toContain("Open route in AllTrails");
  expect(html).toContain("custom-route-camacha-levada-dos-tornos-48092f7?u=m&amp;sh=vmjvek");
  expect(html).not.toContain("Load interactive route");
  expect(html).not.toContain("<iframe");
 });
 it("retains opt-in maps for standard trails",()=>{
  const html=renderToStaticMarkup(createElement(WalkRoute,{url:"https://www.alltrails.com/explore/trail/portugal/madeira--2/levada-das-rabacas"}));
  expect(html).toContain("Load interactive route");
  expect(html).not.toContain("<iframe");
 });
});
